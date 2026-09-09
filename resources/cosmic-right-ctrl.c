/* Cosmic Wispr: read-only, socket-activated Right Ctrl gesture source.
 * Only DOWN/UP/CHORD/TAP_RESET/RESET/READY/UNAVAILABLE leave this process. No key grab,
 * injected events, key names, typed text, network access, or event log. */
#define _GNU_SOURCE
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/input.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <systemd/sd-bus.h>
#include <systemd/sd-login.h>
#include <time.h>
#include <unistd.h>

#define MAX_DEVICES 64
#define KEY_BYTES ((KEY_MAX + 8) / 8)
struct keyboard { int fd; char path[128]; unsigned char held[KEY_BYTES]; };
static struct keyboard devices[MAX_DEVICES];
static int count;
static int candidate;
static uint64_t recent_up;
static volatile sig_atomic_t running = 1;
static uint64_t now_ms(void) {
    struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t);
    return (uint64_t)t.tv_sec * 1000 + t.tv_nsec / 1000000;
}
static void stop(int signal) { (void)signal; running = 0; }
static int bit(const unsigned char *bits, int key) { return (bits[key / 8] >> (key % 8)) & 1; }
static int held(int key) {
    for (int i = 0; i < count; ++i) if (bit(devices[i].held, key)) return 1;
    return 0;
}
static int other_held(void) {
    for (int key = 1; key <= KEY_MAX; ++key)
        if (key != KEY_RIGHTCTRL && held(key)) return 1;
    return 0;
}
/* Return semantic events only. Keyboard chords are observed, never consumed. */
static const char *filter_key(int device, int code, int value, uint64_t now) {
    if (code < 1 || code > KEY_MAX || value == 2) return NULL;
    int before = held(KEY_RIGHTCTRL);
    if (value) devices[device].held[code / 8] |= 1 << (code % 8);
    else devices[device].held[code / 8] &= ~(1 << (code % 8));
    int after = held(KEY_RIGHTCTRL);
    if (code == KEY_RIGHTCTRL) {
        if (!before && after && !other_held()) {
            candidate = 1; recent_up = 0; return "DOWN";
        }
        if (before && !after && candidate) {
            candidate = 0; recent_up = now; return "UP";
        }
    } else if (value && (candidate || (recent_up && now - recent_up <= 350))) {
        const char *event = candidate ? "CHORD" : "TAP_RESET";
        candidate = 0; recent_up = 0; return event;
    }
    return NULL;
}
static int emit(const char *event) {
    char line[32]; int n = snprintf(line, sizeof line, "%s\n", event);
    return send(STDOUT_FILENO, line, n, MSG_NOSIGNAL) == n;
}
static void reset_keys(void) {
    candidate = 0; recent_up = 0;
    for (int i = 0; i < count; ++i) {
        memset(devices[i].held, 0, KEY_BYTES);
        ioctl(devices[i].fd, EVIOCGKEY(KEY_BYTES), devices[i].held);
    }
}
static void scan(void) {
    DIR *dir = opendir("/dev/input"); if (!dir) return;
    struct dirent *entry;
    while ((entry = readdir(dir)) && count < MAX_DEVICES) {
        if (strncmp(entry->d_name, "event", 5)) continue;
        char path[128];
        int length = snprintf(path, sizeof path, "/dev/input/%s", entry->d_name);
        if (length < 0 || (size_t)length >= sizeof path) continue;
        int exists = 0;
        for (int i = 0; i < count; ++i) if (!strcmp(devices[i].path, path)) exists = 1;
        if (exists) continue;
        int fd = open(path, O_RDONLY | O_NONBLOCK | O_CLOEXEC | O_NOFOLLOW);
        if (fd < 0) continue;
        struct stat st; unsigned char keys[KEY_BYTES] = {0};
        if (fstat(fd, &st) || !S_ISCHR(st.st_mode) ||
            ioctl(fd, EVIOCGBIT(EV_KEY, KEY_BYTES), keys) < 0 ||
            !bit(keys, KEY_A) || !bit(keys, KEY_RIGHTCTRL)) { close(fd); continue; }
        devices[count].fd = fd;
        strcpy(devices[count].path, path);
        ioctl(fd, EVIOCGKEY(KEY_BYTES), devices[count].held);
        count++;
    }
    closedir(dir);
}
static int session_allowed(sd_bus *bus, uid_t uid) {
    char *session = NULL, *type = NULL, *path = NULL;
    int locked = 1, allowed = 0;
    if (sd_uid_get_display(uid, &session) < 0) goto done;
    if (sd_session_is_active(session) <= 0) goto done;
    if (sd_session_get_type(session, &type) < 0 || strcmp(type, "wayland")) goto done;
    if (sd_bus_path_encode("/org/freedesktop/login1/session", session, &path) < 0) goto done;
    if (sd_bus_get_property_trivial(bus, "org.freedesktop.login1", path,
            "org.freedesktop.login1.Session", "LockedHint", NULL, 'b', &locked) < 0) goto done;
    allowed = !locked;
done:
    free(session); free(type); free(path); return allowed;
}
int main(void) {
    struct ucred peer; socklen_t size = sizeof peer;
    if (getsockopt(STDIN_FILENO, SOL_SOCKET, SO_PEERCRED, &peer, &size) || !peer.uid) return 1;
    signal(SIGTERM, stop); signal(SIGINT, stop); signal(SIGPIPE, SIG_IGN);
    sd_bus *bus = NULL;
    if (sd_bus_open_system(&bus) < 0) return 1;
    sd_bus_set_method_call_timeout(bus, 250000);
    int previous_count = -1, previous_allowed = 0;
    uint64_t last_scan = 0;
    while (running) {
        uint64_t now = now_ms();
        if (now - last_scan >= 1000) { scan(); last_scan = now; }
        int allowed = count > 0 && session_allowed(bus, peer.uid);
        if (allowed != previous_allowed || previous_count != count) {
            reset_keys();
            if (!emit(allowed ? "READY" : "UNAVAILABLE")) break;
            previous_allowed = allowed; previous_count = count;
        }
        struct pollfd fds[MAX_DEVICES + 1] = {{.fd = STDIN_FILENO, .events = POLLIN | POLLRDHUP}};
        int polled = count;
        for (int i = 0; i < polled; ++i) fds[i + 1] = (struct pollfd){.fd=devices[i].fd,.events=POLLIN};
        int result = poll(fds, polled + 1, 200);
        if (result < 0) { if (errno == EINTR) continue; break; }
        // Client data is never a command. Disconnect or any input closes the helper.
        if (fds[0].revents) break;
        for (int i = polled - 1; i >= 0; --i) {
            if (!fds[i + 1].revents) continue;
            struct input_event events[32];
            ssize_t bytes = read(devices[i].fd, events, sizeof events);
            if (bytes <= 0) {
                if (bytes < 0 && (errno == EAGAIN || errno == EINTR)) continue;
                close(devices[i].fd); devices[i] = devices[--count];
                reset_keys(); if (!emit("RESET")) running = 0;
                continue;
            }
            // Recheck before dispatch, including when a key wakes the locked session.
            if (!session_allowed(bus, peer.uid)) {
                reset_keys(); if (!emit("UNAVAILABLE")) running = 0;
                previous_allowed = 0; continue;
            }
            for (size_t j = 0; j < (size_t)bytes / sizeof *events; ++j) {
                struct input_event *e = &events[j];
                if (e->type == EV_SYN && e->code == SYN_DROPPED) {
                    reset_keys(); if (!emit("RESET")) running = 0; break;
                }
                if (e->type != EV_KEY) continue;
                const char *event = filter_key(i, e->code, e->value, now_ms());
                if (event && !emit(event)) running = 0;
            }
        }
    }
    for (int i = 0; i < count; ++i) close(devices[i].fd);
    sd_bus_unref(bus); return 0;
}
