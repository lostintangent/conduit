.PHONY: build run test clean docker docker-run all

BINARY_NAME=sandbox-ipc
VERSION?=dev

all: build

# Build the binary
build:
	go build -ldflags="-w -s" -o $(BINARY_NAME) ./cmd/server

# Build with version
build-version:
	go build -ldflags="-w -s -X main.version=$(VERSION)" -o $(BINARY_NAME) ./cmd/server

# Run the server
run:
	go run ./cmd/server

# Run with a specific workspace
run-workspace:
	go run ./cmd/server --workspace $(WORKSPACE)

# Run tests
test:
	go test -v ./...

# Run tests with coverage
test-coverage:
	go test -v -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

# Clean build artifacts
clean:
	rm -f $(BINARY_NAME)
	rm -rf dist/
	rm -f coverage.out coverage.html

# Download dependencies
deps:
	go mod download
	go mod tidy

# Build for all platforms
build-all:
	chmod +x scripts/build.sh
	./scripts/build.sh

# Docker build
docker:
	docker build -t sandbox-ipc .

# Docker run
docker-run:
	docker run -p 3000:3000 -v $(PWD)/workspace:/workspace sandbox-ipc

# Format code
fmt:
	go fmt ./...

# Lint code (requires golangci-lint)
lint:
	golangci-lint run

# Check for vulnerabilities
vuln:
	go install golang.org/x/vuln/cmd/govulncheck@latest
	govulncheck ./...
