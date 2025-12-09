This Dockerfile forms the base for our remote and local sandboxes. This is built as the uVM custom image, and in the future will be used for local docker sandboxes and other remote sandbox options.

## Building the Image

```bash
docker buildx build --platform linux/amd64 -t conduit-sandbox -f build/sandbox/Dockerfile . --load


# push to ghcr container registry
./build/sandbox/scripts/push-to-ghcr.sh latest
```

A current snapshot of the image is published to docker hub as `nickdepinet/conduit-sandbox`
