//go:build !windows

package main

func hotkeysLoop(a *jsAPI) {
	<-a.done
}
