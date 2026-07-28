//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

func showError(title, msg string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	messageBox := user32.NewProc("MessageBoxW")
	ptr := syscall.StringToUTF16Ptr
	messageBox.Call(0, uintptr(unsafe.Pointer(ptr(msg))), uintptr(unsafe.Pointer(ptr(title))), 0x10)
}
