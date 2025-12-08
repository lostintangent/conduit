This Dockerfile forms the base for our remote and local sandboxes. This is built as the uVM custom image, and in the future will be used for local docker sandboxes and other remote sandbox options.

## Building the Image

```bash
docker build -t conduit-sandbox -f build/sandbox/Dockerfile .
```

A current snapshot of the image is published to docker hub as `nickdepinet/conduit-sandbox`
