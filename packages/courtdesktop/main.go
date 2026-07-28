package main

import (
	"flag"

	"github.com/AlexanderKuzikov/CourtDesk/packages/courtdesktop/internal/model"
	"github.com/AlexanderKuzikov/CourtDesk/packages/courtdesktop/internal/ui"
)

func main() {
	role := flag.String("role", "", "user или admin (по умолчанию из профиля)")
	flag.Parse()

	profile := model.LoadProfile()
	if *role != "" {
		profile.Role = *role
		_ = profile.Save()
	}

	ui.Run()
}
