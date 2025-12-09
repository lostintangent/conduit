// sandbox-ipc-provider-go - Standalone filesystem provider for cloud editor functionality.
//
// This is the main entry point for the filesystem server.
// It provides unified file operations with integrated change watching
// designed to run in VMs backing cloud terminals.
package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/lostintangent/conduit/packages/sandbox-ipc-provider-go/internal/server"
)

func main() {
	// Parse command-line flags
	port := flag.Int("port", 3000, "Port to listen on")
	host := flag.String("host", "0.0.0.0", "Host to bind to")
	workspace := flag.String("workspace", "", "Workspace directory to serve (defaults to current directory)")
	flag.Parse()

	// Determine workspace path
	workspacePath := *workspace
	if workspacePath == "" {
		workspacePath = os.Getenv("WORKSPACE_PATH")
	}
	if workspacePath == "" {
		var err error
		workspacePath, err = os.Getwd()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error getting current directory: %v\n", err)
			os.Exit(1)
		}
	}

	// Create server
	srv, err := server.NewServer(workspacePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating server: %v\n", err)
		os.Exit(1)
	}

	// Handle graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigCh
		fmt.Println("\nShutting down...")
		srv.Stop()
		os.Exit(0)
	}()

	// Start server
	addr := fmt.Sprintf("%s:%d", *host, *port)
	if err := srv.Start(addr); err != nil {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
}
