package client

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const apiBase = "http://127.0.0.1:8767/api"

var httpClient = &http.Client{Timeout: 10 * time.Second}

func Get[T any](path string) (T, error) {
	var zero T
	resp, err := httpClient.Get(apiBase + path)
	if err != nil {
		return zero, fmt.Errorf("HTTP: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return zero, fmt.Errorf("read: %w", err)
	}
	var apiResp APIResponse[T]
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return zero, fmt.Errorf("json: %w", err)
	}
	if !apiResp.Success {
		return zero, fmt.Errorf("%s", apiResp.Error)
	}
	return apiResp.Data, nil
}

func Post[T any](path string, body any) (T, error) {
	var zero T
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = strings.NewReader(string(b))
	}
	req, err := http.NewRequest("POST", apiBase+path, r)
	if err != nil {
		return zero, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return zero, fmt.Errorf("HTTP: %w", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	var apiResp APIResponse[T]
	if err := json.Unmarshal(b, &apiResp); err != nil {
		return zero, fmt.Errorf("json: %w", err)
	}
	if !apiResp.Success {
		return zero, fmt.Errorf("%s", apiResp.Error)
	}
	return apiResp.Data, nil
}

func Put[T any](path string, body any) (T, error) {
	var zero T
	b, _ := json.Marshal(body)
	req, err := http.NewRequest("PUT", apiBase+path, strings.NewReader(string(b)))
	if err != nil {
		return zero, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return zero, fmt.Errorf("HTTP: %w", err)
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(resp.Body)
	var apiResp APIResponse[T]
	if err := json.Unmarshal(rb, &apiResp); err != nil {
		return zero, fmt.Errorf("json: %w", err)
	}
	if !apiResp.Success {
		return zero, fmt.Errorf("%s", apiResp.Error)
	}
	return apiResp.Data, nil
}

func Patch[T any](path string, body any) (T, error) {
	var zero T
	b, _ := json.Marshal(body)
	req, err := http.NewRequest("PATCH", apiBase+path, strings.NewReader(string(b)))
	if err != nil {
		return zero, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return zero, fmt.Errorf("HTTP: %w", err)
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(resp.Body)
	var apiResp APIResponse[T]
	if err := json.Unmarshal(rb, &apiResp); err != nil {
		return zero, fmt.Errorf("json: %w", err)
	}
	if !apiResp.Success {
		return zero, fmt.Errorf("%s", apiResp.Error)
	}
	return apiResp.Data, nil
}

func Delete(path string) error {
	req, err := http.NewRequest("DELETE", apiBase+path, nil)
	if err != nil {
		return err
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("HTTP: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var apiResp APIResponse[any]
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return fmt.Errorf("json: %w", err)
	}
	if !apiResp.Success {
		return fmt.Errorf("%s", apiResp.Error)
	}
	return nil
}
