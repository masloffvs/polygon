# TSX Validator Build Configuration
# 
# Targets:
#   make          - Build standalone CLI tool
#   make lib      - Build static library for integration
#   make shared   - Build shared library (.so)
#   make all      - Build everything
#   make test     - Run tests
#   make install  - Install to /usr/local
#   make clean    - Clean build artifacts

CC ?= gcc
AR ?= ar
CFLAGS ?= -O3 -Wall -Wextra -Werror -std=c11 -fPIC
LDFLAGS ?= 
PREFIX ?= /usr/local

# Source files
LIB_SRC = tsx_validator.c
CLI_SRC = tsx_validator_main.c
HEADER = tsx_validator.h

# Output files
CLI_BIN = tsx_validator
STATIC_LIB = libtsx_validator.a
SHARED_LIB = libtsx_validator.so

# Object files
LIB_OBJ = $(LIB_SRC:.c=.o)
CLI_OBJ = $(CLI_SRC:.c=.o)

.PHONY: all cli lib shared clean install uninstall test

# Default target - build CLI
cli: $(CLI_BIN)

# Build all targets
all: cli lib shared

# Build static library
lib: $(STATIC_LIB)

# Build shared library
shared: $(SHARED_LIB)

# Compile object files
%.o: %.c $(HEADER)
	$(CC) $(CFLAGS) -c $< -o $@

# Link CLI binary
$(CLI_BIN): $(LIB_OBJ) $(CLI_OBJ)
	$(CC) $(CFLAGS) $(LDFLAGS) $^ -o $@

# Create static library
$(STATIC_LIB): $(LIB_OBJ)
	$(AR) rcs $@ $^

# Create shared library
$(SHARED_LIB): $(LIB_OBJ)
	$(CC) $(CFLAGS) -shared $^ -o $@

# Install to system
install: $(CLI_BIN) $(STATIC_LIB) $(SHARED_LIB)
	install -d $(PREFIX)/bin
	install -d $(PREFIX)/lib
	install -d $(PREFIX)/include
	install -m 755 $(CLI_BIN) $(PREFIX)/bin/
	install -m 644 $(STATIC_LIB) $(PREFIX)/lib/
	install -m 755 $(SHARED_LIB) $(PREFIX)/lib/
	install -m 644 $(HEADER) $(PREFIX)/include/

uninstall:
	rm -f $(PREFIX)/bin/$(CLI_BIN)
	rm -f $(PREFIX)/lib/$(STATIC_LIB)
	rm -f $(PREFIX)/lib/$(SHARED_LIB)
	rm -f $(PREFIX)/include/$(HEADER)

# Run tests on project TSX files
test: $(CLI_BIN)
	@echo "Running validation on project TSX files..."
	@./$(CLI_BIN) ../src/**/*.tsx ../src/**/**/*.tsx 2>/dev/null || true
	@echo ""
	@echo "Test with intentionally broken JSX:"
	@echo '<div><span></div>' | ./$(CLI_BIN) /dev/stdin 2>&1 || true

# Quick validation of entire project
validate: $(CLI_BIN)
	@find ../src -name "*.tsx" -o -name "*.jsx" | xargs ./$(CLI_BIN)

clean:
	rm -f $(LIB_OBJ) $(CLI_OBJ)
	rm -f $(CLI_BIN) $(STATIC_LIB) $(SHARED_LIB)

# Debug build
debug: CFLAGS = -g -O0 -Wall -Wextra -std=c11 -DDEBUG -fsanitize=address
debug: LDFLAGS = -fsanitize=address
debug: clean cli

# Show help
help:
	@echo "TSX Validator Build System"
	@echo ""
	@echo "Targets:"
	@echo "  make          - Build CLI tool"
	@echo "  make lib      - Build static library (libtsx_validator.a)"
	@echo "  make shared   - Build shared library (libtsx_validator.so)"
	@echo "  make all      - Build everything"
	@echo "  make test     - Run tests"
	@echo "  make validate - Validate all TSX files in ../src"
	@echo "  make install  - Install to $(PREFIX)"
	@echo "  make clean    - Remove build artifacts"
	@echo "  make debug    - Build with debug symbols and sanitizers"
	@echo ""
	@echo "Integration examples:"
	@echo "  # Link with static library:"
	@echo "  gcc your_app.c -L. -ltsx_validator -o your_app"
	@echo ""
	@echo "  # Link with shared library:"
	@echo "  gcc your_app.c -L. -ltsx_validator -Wl,-rpath,. -o your_app"
