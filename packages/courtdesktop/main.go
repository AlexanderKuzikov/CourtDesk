package main

import (
	"github.com/AlexanderKuzikov/CourtDesk/packages/courtdesktop/internal/client"
	"github.com/AlexanderKuzikov/CourtDesk/packages/courtdesktop/internal/model"
	"github.com/AlexanderKuzikov/CourtDesk/packages/courtdesktop/internal/ui"
)

func main() {
	profile := model.LoadProfile()
	client.Init(profile.APIURL)
	ui.Run()
}
