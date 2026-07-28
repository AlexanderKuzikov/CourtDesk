//go:build !windows

package main

import "fmt"

func showError(title, msg string) {
	fmt.Println(title)
	fmt.Println(msg)
}
