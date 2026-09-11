FROM alpine:3.21

RUN apk add --no-cache curl

# supercronic — cron daemon with proper env var support and structured logging.
# Change to supercronic-linux-arm64 if running on Graviton (arm64) EC2.
ENV SUPERCRONIC_VERSION=0.2.33
RUN wget -q -O /usr/local/bin/supercronic \
    "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
    && chmod +x /usr/local/bin/supercronic \
    && /usr/local/bin/supercronic -version

COPY crontab /app/crontab
# Strip Windows CRLF line endings so supercronic can exec commands correctly
RUN sed -i 's/\r$//' /app/crontab

# Absolute path, not the bare name. supercronic enables process reaping when it is
# PID 1 — which it always is here — and reaping re-executes the process through
# syscall.Exec(os.Args[0], ...). syscall.Exec does no PATH lookup, so a bare
# "supercronic" as argv[0] resolves to nothing and the container dies immediately
# with `Failed to fork exec: no such file or directory`.
#
# The failure is invisible in every ordinary check: `supercronic -test` validates
# the crontab fine, and running it under `sh -c` works because supercronic is then
# a child rather than PID 1, so reaping never starts. It only fails as CMD.
CMD ["/usr/local/bin/supercronic", "/app/crontab"]
