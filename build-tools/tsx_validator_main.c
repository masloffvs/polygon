/**
 * TSX Validator CLI
 * Standalone tool for validating TSX/JSX files
 *
 * Usage:
 *   tsx_validator [options] <files...>
 *   tsx_validator "src/components/Button.tsx"
 *   find src -name "*.tsx" | xargs tsx_validator
 *
 * Options:
 *   -q, --quiet     Only output errors
 *   -s, --stop      Stop on first error
 *   -h, --help      Show help
 */

#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <dirent.h>
#include <sys/stat.h>
#include <time.h>
#include <fnmatch.h>
#include "tsx_validator.h"

#define MAX_FILES 4096
#define PATH_MAX_LEN 4096
#define MAX_IGNORE_PATTERNS 256
#define IGNORE_FILE ".tsxcheckignore"

static char *ignore_patterns[MAX_IGNORE_PATTERNS];
static int ignore_pattern_count = 0;

typedef struct
{
    bool quiet;
    bool stop_on_first;
    bool help;
    const char *files[MAX_FILES];
    int file_count;
} CliOptions;

static void print_usage(const char *program)
{
    printf("TSX/JSX Tag Validator - Fast markup validation\n\n");
    printf("Usage: %s [options] <files...>\n\n", program);
    printf("Options:\n");
    printf("  -q, --quiet     Only output errors\n");
    printf("  -s, --stop      Stop on first error\n");
    printf("  -h, --help      Show this help\n\n");
    printf("Examples:\n");
    printf("  %s src/**/*.tsx\n", program);
    printf("  find src -name '*.tsx' | xargs %s\n", program);
    printf("  %s -s src/components/Button.tsx\n\n", program);
}

static bool parse_args(int argc, char *argv[], CliOptions *opts)
{
    memset(opts, 0, sizeof(CliOptions));

    for (int i = 1; i < argc; i++)
    {
        const char *arg = argv[i];

        if (arg[0] == '-')
        {
            if (strcmp(arg, "-q") == 0 || strcmp(arg, "--quiet") == 0)
            {
                opts->quiet = true;
            }
            else if (strcmp(arg, "-s") == 0 || strcmp(arg, "--stop") == 0)
            {
                opts->stop_on_first = true;
            }
            else if (strcmp(arg, "-h") == 0 || strcmp(arg, "--help") == 0)
            {
                opts->help = true;
            }
            else
            {
                fprintf(stderr, "Unknown option: %s\n", arg);
                return false;
            }
        }
        else
        {
            if (opts->file_count >= MAX_FILES)
            {
                fprintf(stderr, "Too many files (max %d)\n", MAX_FILES);
                return false;
            }
            opts->files[opts->file_count++] = arg;
        }
    }

    return true;
}

static bool is_tsx_file(const char *path)
{
    size_t len = strlen(path);
    if (len < 4)
        return false;

    const char *ext = path + len - 4;
    return (strcmp(ext, ".tsx") == 0 || strcmp(ext, ".jsx") == 0);
}

static void load_ignore_patterns(void)
{
    FILE *f = fopen(IGNORE_FILE, "r");
    if (!f)
        return;

    char line[PATH_MAX_LEN];
    while (fgets(line, sizeof(line), f) && ignore_pattern_count < MAX_IGNORE_PATTERNS)
    {
        /* Remove trailing newline */
        size_t len = strlen(line);
        while (len > 0 && (line[len - 1] == '\n' || line[len - 1] == '\r'))
        {
            line[--len] = '\0';
        }

        /* Skip empty lines and comments */
        if (len == 0 || line[0] == '#')
            continue;

        ignore_patterns[ignore_pattern_count++] = strdup(line);
    }

    fclose(f);
}

static void free_ignore_patterns(void)
{
    for (int i = 0; i < ignore_pattern_count; i++)
    {
        free(ignore_patterns[i]);
    }
    ignore_pattern_count = 0;
}

static bool is_ignored(const char *filepath)
{
    for (int i = 0; i < ignore_pattern_count; i++)
    {
        /* Match against full path and basename */
        if (fnmatch(ignore_patterns[i], filepath, 0) == 0)
            return true;

        /* Also try matching just the filename */
        const char *basename = strrchr(filepath, '/');
        basename = basename ? basename + 1 : filepath;
        if (fnmatch(ignore_patterns[i], basename, 0) == 0)
            return true;
    }
    return false;
}

int main(int argc, char *argv[])
{
    CliOptions opts;

    if (!parse_args(argc, argv, &opts))
    {
        print_usage(argv[0]);
        return 1;
    }

    if (opts.help)
    {
        print_usage(argv[0]);
        return 0;
    }

    if (opts.file_count == 0)
    {
        fprintf(stderr, "Error: No files specified\n\n");
        print_usage(argv[0]);
        return 1;
    }

    /* Load ignore patterns from .tsxcheckignore */
    load_ignore_patterns();

    clock_t start = clock();

    int total_files = 0;
    int total_tags = 0;
    int errors = 0;

    for (int i = 0; i < opts.file_count; i++)
    {
        const char *filepath = opts.files[i];

        if (!is_tsx_file(filepath))
        {
            if (!opts.quiet)
            {
                fprintf(stderr, "Skipping non-TSX file: %s\n", filepath);
            }
            continue;
        }

        /* Check if file is in ignore list */
        if (is_ignored(filepath))
        {
            if (!opts.quiet)
            {
                printf("\033[33m⊘\033[0m %s (ignored)\n", filepath);
            }
            continue;
        }

        TsxValidationResult result = tsx_validate_file(filepath);
        total_files++;
        total_tags += result.tags_checked;

        if (!result.valid)
        {
            errors++;
            fprintf(stderr, "\033[31m✗\033[0m %s:%d:%d: %s\n",
                    filepath, result.line, result.col, result.error);

            if (opts.stop_on_first)
            {
                break;
            }
        }
        else if (!opts.quiet)
        {
            printf("\033[32m✓\033[0m %s (%d tags)\n", filepath, result.tags_checked);
        }
    }

    clock_t end = clock();
    double elapsed = (double)(end - start) / CLOCKS_PER_SEC;

    if (!opts.quiet || errors > 0)
    {
        printf("\n");
        if (errors > 0)
        {
            printf("\033[31m");
        }
        else
        {
            printf("\033[32m");
        }
        printf("Checked %d files, %d tags in %.3fs", total_files, total_tags, elapsed);
        if (errors > 0)
        {
            printf(" - %d error(s) found", errors);
        }
        printf("\033[0m\n");
    }

    free_ignore_patterns();
    return errors > 0 ? 1 : 0;
}
