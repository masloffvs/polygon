/**
 * TSX/JSX Tag Validator Implementation
 * Optimized for speed with minimal allocations
 */

#define _GNU_SOURCE
#include "tsx_validator.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <strings.h>

/* Self-closing HTML5 tags */
static const char *SELF_CLOSING_TAGS[] = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr", NULL};

const char *tsx_get_self_closing_tags(void)
{
    return "area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr";
}

bool tsx_is_self_closing(const char *tag_name)
{
    for (int i = 0; SELF_CLOSING_TAGS[i] != NULL; i++)
    {
        if (strcasecmp(tag_name, SELF_CLOSING_TAGS[i]) == 0)
        {
            return true;
        }
    }
    return false;
}

void tsx_parser_init(TsxParserState *state)
{
    memset(state, 0, sizeof(TsxParserState));
    state->current_line = 1;
    state->current_col = 1;
}

void tsx_result_init(TsxValidationResult *result)
{
    memset(result, 0, sizeof(TsxValidationResult));
    result->valid = true;
}

static inline bool is_tag_char(char c)
{
    return isalnum((unsigned char)c) || c == '-' || c == '_' || c == '.' || c == ':';
}

static inline bool is_jsx_tag_start(char c)
{
    return isupper((unsigned char)c) || islower((unsigned char)c) || c == '_';
}

/* Check if we're in a TypeScript type context (not JSX) */
static bool is_typescript_context(const char *content, const char *pos)
{
    /* Scan backwards to find context */
    const char *p = pos - 1;

    /* Skip whitespace */
    while (p >= content && (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r'))
    {
        p--;
    }

    if (p < content)
        return false;

    /* Type annotation context: colon before < */
    if (*p == ':')
        return true;

    /* Closing bracket ] before < likely indicates type context */
    if (*p == ']')
        return true;

    /* Scan back to find the identifier */
    const char *word_end = p + 1;
    while (p >= content && (isalnum((unsigned char)*p) || *p == '_'))
    {
        p--;
    }
    p++;

    size_t word_len = (size_t)(word_end - p);

    /* TypeScript keywords that introduce type contexts */
    if ((word_len == 9 && strncmp(p, "satisfies", 9) == 0) ||
        (word_len == 7 && strncmp(p, "extends", 7) == 0) ||
        (word_len == 10 && strncmp(p, "implements", 10) == 0) ||
        (word_len == 2 && strncmp(p, "as", 2) == 0) ||
        (word_len == 4 && strncmp(p, "type", 4) == 0) ||
        (word_len == 3 && strncmp(p, "new", 3) == 0) ||
        (word_len == 6 && strncmp(p, "typeof", 6) == 0) ||
        (word_len == 5 && strncmp(p, "keyof", 5) == 0) ||
        (word_len == 5 && strncmp(p, "infer", 5) == 0))
    {
        return true;
    }

    /* Check if identifier immediately precedes < (no space) - likely generic */
    if (word_len > 0 && word_end == pos)
    {
        /* Check if it's likely a type name (starts with uppercase) */
        if (isupper((unsigned char)*p))
            return true;

        /* Common lowercase type names and generic functions */
        if ((word_len == 6 && strncmp(p, "string", 6) == 0) ||
            (word_len == 6 && strncmp(p, "number", 6) == 0) ||
            (word_len == 10 && strncmp(p, "forwardRef", 10) == 0) ||
            (word_len == 4 && strncmp(p, "memo", 4) == 0) ||
            (word_len == 4 && strncmp(p, "lazy", 4) == 0) ||
            (word_len == 13 && strncmp(p, "createContext", 13) == 0) ||
            (word_len == 8 && strncmp(p, "useState", 8) == 0) ||
            (word_len == 6 && strncmp(p, "useRef", 6) == 0) ||
            (word_len == 10 && strncmp(p, "useReducer", 10) == 0) ||
            (word_len == 10 && strncmp(p, "useContext", 10) == 0) ||
            (word_len == 11 && strncmp(p, "useCallback", 11) == 0) ||
            (word_len == 7 && strncmp(p, "useMemo", 7) == 0))
        {
            return true;
        }

        /* Check for object.method<T> pattern (dot before identifier) */
        if (p > content && *(p - 1) == '.')
        {
            return true;
        }
    }

    /* Check context before the identifier */
    const char *before_word = p - 1;
    while (before_word >= content && (*before_word == ' ' || *before_word == '\t'))
    {
        before_word--;
    }

    /* After these chars, < is likely type context, not JSX */
    /* Note: ( and { are NOT included - JSX can appear after them */
    /* Note: & is checked specially - && is JSX conditional, single & is type intersection */
    if (before_word >= content &&
        (*before_word == ':' || *before_word == ';' || *before_word == ',' ||
         *before_word == '=' || *before_word == '|' || *before_word == '?'))
    {
        return true;
    }

    /* Check for single & (type intersection) vs && (logical AND in JSX) */
    if (before_word >= content && *before_word == '&')
    {
        /* If previous char is also &, this is && (logical AND) - not type context */
        if (before_word > content && *(before_word - 1) == '&')
        {
            return false;
        }
        /* Single & is type intersection context */
        return true;
    }

    return false;
}

static void push_tag(TsxParserState *state, const char *name, int line, int col)
{
    if (state->top >= TSX_MAX_STACK_DEPTH - 1)
        return;

    TsxTag *tag = &state->stack[state->top++];
    size_t len = strlen(name);
    if (len >= TSX_MAX_TAG_NAME)
    {
        len = TSX_MAX_TAG_NAME - 1;
    }
    memcpy(tag->name, name, len);
    tag->name[len] = '\0';
    tag->line = line;
    tag->col = col;
}

static bool pop_tag(TsxParserState *state, const char *name, TsxValidationResult *result)
{
    if (state->top <= 0)
    {
        result->valid = false;
        snprintf(result->error, TSX_MAX_ERROR_MSG,
                 "Closing tag </%s> has no matching opening tag", name);
        return false;
    }

    TsxTag *top = &state->stack[state->top - 1];

    if (strcmp(top->name, name) != 0)
    {
        result->valid = false;
        snprintf(result->error, TSX_MAX_ERROR_MSG,
                 "Mismatched tags: expected </%s> (opened at line %d) but found </%s>",
                 top->name, top->line, name);
        return false;
    }

    state->top--;
    return true;
}

static inline void advance(TsxParserState *state, char c)
{
    if (c == '\n')
    {
        state->current_line++;
        state->current_col = 1;
    }
    else
    {
        state->current_col++;
    }
}

TsxValidationResult tsx_validate_buffer(const char *content, size_t content_len)
{
    TsxValidationResult result;
    TsxParserState state;

    tsx_result_init(&result);
    tsx_parser_init(&state);

    const char *p = content;
    const char *end = content + content_len;

    while (p < end && result.valid)
    {
        char c = *p;

        /* Handle newlines for line tracking */
        if (c == '\n')
        {
            if (state.in_comment)
            {
                state.in_comment = false;
            }
            advance(&state, c);
            p++;
            continue;
        }

        /* Skip single-line comments */
        if (!state.in_string && !state.in_multiline_comment &&
            p + 1 < end && c == '/' && *(p + 1) == '/')
        {
            state.in_comment = true;
            p += 2;
            state.current_col += 2;
            continue;
        }

        if (state.in_comment)
        {
            advance(&state, c);
            p++;
            continue;
        }

        /* Handle multi-line comments: slash-star ... star-slash */
        if (!state.in_string && !state.in_multiline_comment &&
            p + 1 < end && c == '/' && *(p + 1) == '*')
        {
            state.in_multiline_comment = true;
            p += 2;
            state.current_col += 2;
            continue;
        }

        if (state.in_multiline_comment)
        {
            if (p + 1 < end && c == '*' && *(p + 1) == '/')
            {
                state.in_multiline_comment = false;
                p += 2;
                state.current_col += 2;
                continue;
            }
            advance(&state, c);
            p++;
            continue;
        }

        /* Handle strings */
        if (!state.in_template_literal && (c == '"' || c == '\''))
        {
            if (!state.in_string)
            {
                state.in_string = true;
                state.string_char = c;
            }
            else if (c == state.string_char && *(p - 1) != '\\')
            {
                state.in_string = false;
            }
            advance(&state, c);
            p++;
            continue;
        }

        /* Handle template literals */
        if (c == '`')
        {
            if (!state.in_template_literal)
            {
                state.in_template_literal = true;
                state.template_depth = 0;
            }
            else if (state.template_depth == 0)
            {
                state.in_template_literal = false;
            }
            advance(&state, c);
            p++;
            continue;
        }

        /* Handle template literal expressions ${} */
        if (state.in_template_literal)
        {
            if (c == '$' && p + 1 < end && *(p + 1) == '{')
            {
                state.template_depth++;
                p += 2;
                state.current_col += 2;
                continue;
            }
            if (c == '{' && state.template_depth > 0)
            {
                state.template_depth++;
            }
            if (c == '}' && state.template_depth > 0)
            {
                state.template_depth--;
            }
            advance(&state, c);
            p++;
            continue;
        }

        if (state.in_string)
        {
            advance(&state, c);
            p++;
            continue;
        }

        /* Parse JSX tags */
        if (c == '<')
        {
            int tag_line = state.current_line;
            int tag_col = state.current_col;

            advance(&state, c);
            p++;

            if (p >= end)
                break;

            /* Skip comparison operators */
            if (*p == '=' || *p == ' ' || *p == '\t' || *p == '\n')
            {
                continue;
            }

            /* Handle closing tags - these are always JSX, never TypeScript */
            bool is_closing = false;
            if (*p == '/')
            {
                is_closing = true;
                advance(&state, *p);
                p++;

                if (p >= end)
                    break;
            }

            /* Check for valid tag start */
            if (!is_jsx_tag_start(*p))
            {
                /* Could be fragment <> or comparison operator */
                if (*p == '>')
                {
                    /* Fragment opening <> or closing </> */
                    if (!is_closing)
                    {
                        push_tag(&state, "", tag_line, tag_col);
                    }
                    else
                    {
                        /* Fragment closing </> */
                        if (!pop_tag(&state, "", &result))
                        {
                            result.line = tag_line;
                            result.col = tag_col;
                        }
                    }
                    advance(&state, *p);
                    p++;
                }
                continue;
            }

            /* For opening tags only: check if this is TypeScript generics context */
            if (!is_closing)
            {
                /* Backtrack to the < position for context check */
                const char *less_than_pos = p;
                while (less_than_pos > content && *(less_than_pos - 1) != '<')
                {
                    less_than_pos--;
                }
                less_than_pos--; /* Point to < */

                if (is_typescript_context(content, less_than_pos))
                {
                    /* Skip TypeScript generic: find matching > */
                    int depth = 1;
                    while (p < end && depth > 0)
                    {
                        if (*p == '<')
                            depth++;
                        else if (*p == '>')
                            depth--;
                        advance(&state, *p);
                        p++;
                    }
                    continue;
                }
            }

            /* Extract tag name */
            char tag_name[TSX_MAX_TAG_NAME];
            int name_len = 0;

            while (p < end && is_tag_char(*p) && name_len < TSX_MAX_TAG_NAME - 1)
            {
                tag_name[name_len++] = *p;
                advance(&state, *p);
                p++;
            }
            tag_name[name_len] = '\0';

            if (name_len == 0)
                continue;

            result.tags_checked++;

            if (is_closing)
            {
                /* Find closing > */
                while (p < end && *p != '>')
                {
                    advance(&state, *p);
                    p++;
                }
                if (p < end)
                {
                    advance(&state, *p);
                    p++;
                }

                if (!pop_tag(&state, tag_name, &result))
                {
                    result.line = tag_line;
                    result.col = tag_col;
                }
            }
            else
            {
                /* Scan for self-closing /> or regular > */
                bool self_closing = tsx_is_self_closing(tag_name);
                int angle_depth = 0;
                bool in_attr_string = false;
                char attr_string_char = 0;

                while (p < end)
                {
                    char ac = *p;

                    /* Handle attribute strings */
                    if (!in_attr_string && (ac == '"' || ac == '\''))
                    {
                        in_attr_string = true;
                        attr_string_char = ac;
                        advance(&state, ac);
                        p++;
                        continue;
                    }

                    if (in_attr_string)
                    {
                        if (ac == attr_string_char && *(p - 1) != '\\')
                        {
                            in_attr_string = false;
                        }
                        advance(&state, ac);
                        p++;
                        continue;
                    }

                    /* Handle template literal in attributes */
                    if (ac == '{')
                    {
                        angle_depth++;
                        advance(&state, ac);
                        p++;
                        continue;
                    }

                    if (ac == '}')
                    {
                        angle_depth--;
                        advance(&state, ac);
                        p++;
                        continue;
                    }

                    if (angle_depth > 0)
                    {
                        advance(&state, ac);
                        p++;
                        continue;
                    }

                    /* Check for self-closing */
                    if (ac == '/' && p + 1 < end && *(p + 1) == '>')
                    {
                        self_closing = true;
                        p += 2;
                        state.current_col += 2;
                        break;
                    }

                    if (ac == '>')
                    {
                        advance(&state, ac);
                        p++;
                        break;
                    }

                    advance(&state, ac);
                    p++;
                }

                if (!self_closing)
                {
                    push_tag(&state, tag_name, tag_line, tag_col);
                }
            }
            continue;
        }

        advance(&state, c);
        p++;
    }

    /* Check for unclosed tags */
    if (result.valid && state.top > 0)
    {
        TsxTag *unclosed = &state.stack[state.top - 1];
        result.valid = false;
        result.line = unclosed->line;
        result.col = unclosed->col;

        if (strlen(unclosed->name) == 0)
        {
            snprintf(result.error, TSX_MAX_ERROR_MSG,
                     "Unclosed fragment <> at line %d, col %d",
                     unclosed->line, unclosed->col);
        }
        else
        {
            snprintf(result.error, TSX_MAX_ERROR_MSG,
                     "Unclosed tag <%s> at line %d, col %d (and %d more unclosed)",
                     unclosed->name, unclosed->line, unclosed->col, state.top - 1);
        }
    }

    return result;
}

TsxValidationResult tsx_validate_file(const char *filepath)
{
    TsxValidationResult result;
    tsx_result_init(&result);
    result.files_checked = 1;

    FILE *file = fopen(filepath, "rb");
    if (!file)
    {
        result.valid = false;
        snprintf(result.error, TSX_MAX_ERROR_MSG, "Cannot open file: %s", filepath);
        return result;
    }

    /* Get file size */
    fseek(file, 0, SEEK_END);
    long file_size = ftell(file);
    fseek(file, 0, SEEK_SET);

    if (file_size <= 0)
    {
        fclose(file);
        return result; /* Empty file is valid */
    }

    /* Read entire file */
    char *file_content = (char *)malloc((size_t)file_size + 1);
    if (!file_content)
    {
        fclose(file);
        result.valid = false;
        snprintf(result.error, TSX_MAX_ERROR_MSG, "Out of memory reading: %s", filepath);
        return result;
    }

    size_t read_size = fread(file_content, 1, (size_t)file_size, file);
    file_content[read_size] = '\0';
    fclose(file);

    result = tsx_validate_buffer(file_content, read_size);
    result.files_checked = 1;

    free(file_content);
    return result;
}

TsxValidationResult tsx_validate_files(const char **filepaths, int count, bool stop_on_first_error)
{
    TsxValidationResult combined;
    tsx_result_init(&combined);

    for (int i = 0; i < count; i++)
    {
        TsxValidationResult file_result = tsx_validate_file(filepaths[i]);
        combined.files_checked++;
        combined.tags_checked += file_result.tags_checked;

        if (!file_result.valid)
        {
            combined.valid = false;
            combined.line = file_result.line;
            combined.col = file_result.col;
            /* Truncate path and error to fit in buffer */
            snprintf(combined.error, TSX_MAX_ERROR_MSG,
                     "%.200s: %.300s", filepaths[i], file_result.error);

            if (stop_on_first_error)
            {
                return combined;
            }
        }
    }

    return combined;
}
