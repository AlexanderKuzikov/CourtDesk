package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"
)

type ThemeDef struct {
	Name   string
	Theme  fyne.Theme
	Variant fyne.ThemeVariant
}

var Themes = []ThemeDef{
	{"Slate", newSlateTheme(), theme.VariantDark},
	{"Midnight", newMidnightTheme(), theme.VariantDark},
	{"Light", newLightTheme(), theme.VariantLight},
	{"Paper", newPaperTheme(), theme.VariantLight},
	{"Contrast", newContrastTheme(), theme.VariantDark},
	{"Forest", newForestTheme(), theme.VariantDark},
}

func ThemeByName(name string) *ThemeDef {
	for _, t := range Themes {
		if t.Name == name {
			return &t
		}
	}
	return &Themes[0]
}

type baseTheme struct {
	bg       color.Color
	button   color.Color
	primary  color.Color
	fg       color.Color
	inputBg  color.Color
	inputBdr color.Color
	placeholder color.Color
	scroll   color.Color
	hover    color.Color
	selection color.Color
	variant  fyne.ThemeVariant
}

func (t *baseTheme) Color(name fyne.ThemeColorName, _ fyne.ThemeVariant) color.Color {
	switch name {
	case theme.ColorNameBackground:
		return t.bg
	case theme.ColorNameButton:
		return t.button
	case theme.ColorNamePrimary:
		return t.primary
	case theme.ColorNameForeground:
		return t.fg
	case theme.ColorNameInputBackground:
		return t.inputBg
	case theme.ColorNameInputBorder:
		return t.inputBdr
	case theme.ColorNamePlaceHolder:
		return t.placeholder
	case theme.ColorNameScrollBar:
		return t.scroll
	case theme.ColorNameHover:
		return t.hover
	case theme.ColorNameSelection:
		return t.selection
	}
	return theme.DefaultTheme().Color(name, t.variant)
}

func (t *baseTheme) Font(s fyne.TextStyle) fyne.Resource { return theme.DefaultTheme().Font(s) }
func (t *baseTheme) Icon(s fyne.ThemeIconName) fyne.Resource { return theme.DefaultTheme().Icon(s) }
func (t *baseTheme) Size(s fyne.ThemeSizeName) float32 { return theme.DefaultTheme().Size(s) }

type slateTheme struct{ baseTheme }

func newSlateTheme() *slateTheme {
	return &slateTheme{baseTheme{
		bg:          nrgba(0x0f, 0x17, 0x2a),
		button:      nrgba(0x1e, 0x29, 0x3b),
		primary:     nrgba(0x38, 0xbd, 0xf8),
		fg:          nrgba(0xe2, 0xe8, 0xf0),
		inputBg:     nrgba(0x16, 0x1b, 0x25),
		inputBdr:    nrgba(0x33, 0x47, 0x5e),
		placeholder: nrgba(0x64, 0x74, 0x8b),
		scroll:      nrgba(0x33, 0x47, 0x5e),
		hover:       nrgba(0x33, 0x41, 0x55),
		selection:   nrgba(0x0e, 0x74, 0x9d),
		variant:     theme.VariantDark,
	}}
}

type midnightTheme struct{ baseTheme }

func newMidnightTheme() *midnightTheme {
	return &midnightTheme{baseTheme{
		bg:          nrgba(0x08, 0x08, 0x12),
		button:      nrgba(0x12, 0x12, 0x22),
		primary:     nrgba(0xa7, 0x8b, 0xfa),
		fg:          nrgba(0xd4, 0xd4, 0xd8),
		inputBg:     nrgba(0x0c, 0x0c, 0x18),
		inputBdr:    nrgba(0x28, 0x28, 0x3e),
		placeholder: nrgba(0x58, 0x58, 0x6e),
		scroll:      nrgba(0x28, 0x28, 0x3e),
		hover:       nrgba(0x1e, 0x1e, 0x30),
		selection:   nrgba(0x5b, 0x21, 0xb6),
		variant:     theme.VariantDark,
	}}
}

type lightTheme struct{ baseTheme }

func newLightTheme() *lightTheme {
	return &lightTheme{baseTheme{
		bg:          nrgba(0xf8, 0xfa, 0xfc),
		button:      nrgba(0xe2, 0xe8, 0xf0),
		primary:     nrgba(0x25, 0x63, 0xeb),
		fg:          nrgba(0x1e, 0x29, 0x3b),
		inputBg:     nrgba(0xff, 0xff, 0xff),
		inputBdr:    nrgba(0xcb, 0xd5, 0xe1),
		placeholder: nrgba(0x94, 0xa3, 0xb8),
		scroll:      nrgba(0xcb, 0xd5, 0xe1),
		hover:       nrgba(0xe2, 0xe8, 0xf0),
		selection:   nrgba(0xbf, 0xdb, 0xfe),
		variant:     theme.VariantLight,
	}}
}

type paperTheme struct{ baseTheme }

func newPaperTheme() *paperTheme {
	return &paperTheme{baseTheme{
		bg:          nrgba(0xf5, 0xf0, 0xe8),
		button:      nrgba(0xe0, 0xd5, 0xc5),
		primary:     nrgba(0x8b, 0x5c, 0x2a),
		fg:          nrgba(0x3e, 0x30, 0x24),
		inputBg:     nrgba(0xff, 0xfa, 0xf2),
		inputBdr:    nrgba(0xc8, 0xb8, 0xa0),
		placeholder: nrgba(0x9c, 0x8b, 0x75),
		scroll:      nrgba(0xc8, 0xb8, 0xa0),
		hover:       nrgba(0xe8, 0xdd, 0xcd),
		selection:   nrgba(0xd4, 0xc5, 0xaa),
		variant:     theme.VariantLight,
	}}
}

type contrastTheme struct{ baseTheme }

func newContrastTheme() *contrastTheme {
	return &contrastTheme{baseTheme{
		bg:          nrgba(0x00, 0x00, 0x00),
		button:      nrgba(0x1a, 0x1a, 0x1a),
		primary:     nrgba(0xff, 0xff, 0x00),
		fg:          nrgba(0xff, 0xff, 0xff),
		inputBg:     nrgba(0x0a, 0x0a, 0x0a),
		inputBdr:    nrgba(0xff, 0xff, 0xff),
		placeholder: nrgba(0xaa, 0xaa, 0xaa),
		scroll:      nrgba(0x66, 0x66, 0x66),
		hover:       nrgba(0x33, 0x33, 0x33),
		selection:   nrgba(0x00, 0x5f, 0x00),
		variant:     theme.VariantDark,
	}}
}

type forestTheme struct{ baseTheme }

func newForestTheme() *forestTheme {
	return &forestTheme{baseTheme{
		bg:          nrgba(0x0f, 0x1a, 0x14),
		button:      nrgba(0x1a, 0x2e, 0x22),
		primary:     nrgba(0x4a, 0xde, 0x80),
		fg:          nrgba(0xd1, 0xfa, 0xe5),
		inputBg:     nrgba(0x12, 0x22, 0x18),
		inputBdr:    nrgba(0x2d, 0x4a, 0x38),
		placeholder: nrgba(0x5c, 0x8a, 0x6e),
		scroll:      nrgba(0x2d, 0x4a, 0x38),
		hover:       nrgba(0x1f, 0x3a, 0x2c),
		selection:   nrgba(0x06, 0x5f, 0x46),
		variant:     theme.VariantDark,
	}}
}

func nrgba(r, g, b uint8) color.Color {
	return color.NRGBA{r, g, b, 0xff}
}
