VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS := -s -w -X main.version=$(VERSION)

.PHONY: build test release clean

build:
	go build -ldflags "$(LDFLAGS)" -o bin/hidenseek-agent ./cmd/hidenseek-agent

test:
	go vet ./... && go test ./...

# Static Linux binaries for the install script (GitHub release assets).
release:
	@mkdir -p dist
	@for arch in amd64 arm64; do \
		CGO_ENABLED=0 GOOS=linux GOARCH=$$arch go build -trimpath -ldflags "$(LDFLAGS)" \
			-o dist/hidenseek-agent-linux-$$arch ./cmd/hidenseek-agent && \
		(cd dist && sha256sum hidenseek-agent-linux-$$arch > hidenseek-agent-linux-$$arch.sha256); \
	done

clean:
	rm -rf bin dist
