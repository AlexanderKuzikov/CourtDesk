package ui

import (
	"sync"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"github.com/AlexanderKuzikov/CourtDesk/packages/courtdesktop/internal/client"
)

func NewNotificationsList() fyne.CanvasObject {
	var (
		mu         sync.Mutex
		notif      []client.Notification
		loadNotifs func()
	)

	list := widget.NewList(
		func() int { return len(notif) },
		func() fyne.CanvasObject {
			return container.NewHBox(
				widget.NewLabel(""),
				widget.NewLabel(""),
				widget.NewLabel(""),
			)
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			if id >= len(notif) {
				return
			}
			n := notif[id]
			box := obj.(*fyne.Container)
			indicator := "○"
			if !n.Read {
				indicator = "●"
			}
			box.Objects[0].(*widget.Label).SetText(indicator)
			box.Objects[1].(*widget.Label).SetText(n.Type)
			box.Objects[2].(*widget.Label).SetText(n.Message)
		},
	)

	list.OnSelected = func(id widget.ListItemID) {
		if id < len(notif) {
			n := notif[id]
			if !n.Read {
				go func() {
					_, _ = client.Patch[any]("/notifications/"+n.UID+"/read", nil)
					loadNotifs()
				}()
			}
		}
		list.UnselectAll()
	}

	markAllBtn := widget.NewButton("✓ Прочитать все", func() {
		go func() {
			mu.Lock()
			items := make([]client.Notification, len(notif))
			copy(items, notif)
			mu.Unlock()
			for _, n := range items {
				if !n.Read {
					_, _ = client.Patch[any]("/notifications/"+n.UID+"/read", nil)
				}
			}
			loadNotifs()
		}()
	})

	refreshBtn := widget.NewButton("🔄", func() { loadNotifs() })

	loadNotifs = func() {
		n, err := client.Get[[]client.Notification]("/notifications")
		if err != nil {
			return
		}
		mu.Lock()
		notif = n
		mu.Unlock()
		list.Refresh()
	}

	topBar := container.NewHBox(markAllBtn, refreshBtn)

	go loadNotifs()

	return container.NewBorder(topBar, nil, nil, nil, list)
}
