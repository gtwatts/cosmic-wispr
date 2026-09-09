#define main helper_main
#include "../../resources/cosmic-right-ctrl.c"
#undef main
#include <assert.h>
static void expect(int device, int code, int value, uint64_t time, const char *wanted) {
    const char *got = filter_key(device, code, value, time);
    assert((!got && !wanted) || (got && wanted && !strcmp(got, wanted)));
}
int main(void) {
    count = 2;
    expect(0, KEY_RIGHTCTRL, 1, 100, "DOWN");
    expect(0, KEY_RIGHTCTRL, 2, 110, NULL);
    expect(0, KEY_RIGHTCTRL, 0, 150, "UP");
    expect(0, KEY_C, 1, 160, "TAP_RESET");
    expect(0, KEY_C, 0, 170, NULL);
    expect(0, KEY_RIGHTCTRL, 1, 200, "DOWN");
    expect(1, KEY_C, 1, 220, "CHORD");
    expect(1, KEY_C, 0, 240, NULL);
    expect(0, KEY_RIGHTCTRL, 0, 260, NULL);
    expect(0, KEY_LEFTSHIFT, 1, 300, NULL);
    expect(0, KEY_RIGHTCTRL, 1, 320, NULL);
    expect(0, KEY_LEFTSHIFT, 0, 330, NULL);
    expect(0, KEY_RIGHTCTRL, 0, 340, NULL);
    expect(0, KEY_RIGHTCTRL, 1, 400, "DOWN");
    expect(1, KEY_RIGHTCTRL, 1, 420, NULL);
    expect(0, KEY_RIGHTCTRL, 0, 430, NULL);
    expect(1, KEY_RIGHTCTRL, 0, 440, "UP");
    expect(0, KEY_A, 1, 900, NULL);
    expect(0, KEY_A, 0, 910, NULL);
    expect(0, KEY_MAX + 1, 1, 920, NULL);
    puts("Native keyboard filtering passed");
    return 0;
}
