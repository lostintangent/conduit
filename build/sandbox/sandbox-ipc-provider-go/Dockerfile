# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install git (needed for some go modules)
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum* ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /sandbox-ipc .

# Runtime stage
FROM alpine:3.19

# Install ca-certificates for HTTPS requests
RUN apk --no-cache add ca-certificates

# Create non-root user
RUN adduser -D -u 1000 appuser

WORKDIR /app

# Copy binary from builder
COPY --from=builder /sandbox-ipc /app/sandbox-ipc

# Change ownership
RUN chown -R appuser:appuser /app

USER appuser

# Default port
EXPOSE 9876

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:9876/health || exit 1

# Default command
ENTRYPOINT ["/app/sandbox-ipc"]
CMD ["--port", "9876", "--host", "0.0.0.0"]
