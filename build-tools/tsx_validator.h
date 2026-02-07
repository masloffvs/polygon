/**
 * TSX/JSX Tag Validator
 * Fast validation of TSX/JSX markup for unclosed or mismatched tags
 *
 * Usage as library:
 *   #include "tsx_validator.h"
 *   TsxValidationResult result = tsx_validate_file("Component.tsx");
 *   if (!result.valid) { printf("Error: %s at line %d\n", result.error, result.line); }
 *
 * Usage standalone:
 *   ./tsx_validator src/components/Button.tsx
 */

#ifndef TSX_VALIDATOR_H
#define TSX_VALIDATOR_H

#include <stddef.h>
#include <stdbool.h>

#define TSX_MAX_TAG_NAME 128
#define TSX_MAX_ERROR_MSG 512
#define TSX_MAX_STACK_DEPTH 256

typedef struct
{
    char name[TSX_MAX_TAG_NAME];
    int line;
    int col;
} TsxTag;

typedef struct
{
    bool valid;
    int line;
    int col;
    char error[TSX_MAX_ERROR_MSG];
    int tags_checked;
    int files_checked;
} TsxValidationResult;

typedef struct
{
    TsxTag stack[TSX_MAX_STACK_DEPTH];
    int top;
    int current_line;
    int current_col;
    bool in_string;
    char string_char;
    bool in_template_literal;
    int template_depth;
    bool in_comment;
    bool in_multiline_comment;
    bool in_jsx_expression;
    int jsx_expression_depth;
} TsxParserState;

/**
 * Validate a single TSX/JSX file
 * @param filepath Path to the file
 * @return Validation result with error details if invalid
 */
TsxValidationResult tsx_validate_file(const char *filepath);

/**
 * Validate TSX/JSX content from a buffer
 * @param content The TSX/JSX content as null-terminated string
 * @param content_len Length of content
 * @return Validation result
 */
TsxValidationResult tsx_validate_buffer(const char *content, size_t content_len);

/**
 * Validate multiple files
 * @param filepaths Array of file paths
 * @param count Number of files
 * @param stop_on_first_error If true, stop at first error
 * @return Combined validation result
 */
TsxValidationResult tsx_validate_files(const char **filepaths, int count, bool stop_on_first_error);

/**
 * Get list of self-closing HTML tags
 * @return Comma-separated list
 */
const char *tsx_get_self_closing_tags(void);

/**
 * Check if a tag is self-closing
 * @param tag_name The tag name
 * @return true if self-closing
 */
bool tsx_is_self_closing(const char *tag_name);

/**
 * Initialize parser state
 * @param state Parser state to initialize
 */
void tsx_parser_init(TsxParserState *state);

/**
 * Reset validation result
 * @param result Result to reset
 */
void tsx_result_init(TsxValidationResult *result);

#endif /* TSX_VALIDATOR_H */
