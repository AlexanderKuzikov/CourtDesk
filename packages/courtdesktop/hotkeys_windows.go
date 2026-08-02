//go:build windows

package main

import (
	"syscall"
	"time"
)

func hotkeysLoop(a *jsAPI) {
	user32 := syscall.NewLazyDLL("user32.dll")
	getKeyState := user32.NewProc("GetAsyncKeyState")
	const vkControl = 0x11
	const vkOemComma = 0xBC

	pressed := func(vk int) bool {
		r, _, _ := getKeyState.Call(uintptr(vk))
		return r&0x8000 != 0
	}

	ticker := time.NewTicker(30 * time.Millisecond)
	defer ticker.Stop()
	wasCombo := false
	for {
		select {
		case <-a.done:
			return
		case <-ticker.C:
			combo := pressed(vkControl) && pressed(vkOemComma)
			if combo && !wasCombo {
				a.onHotkeySettings()
			}
			wasCombo = combo
		}
	}
}
