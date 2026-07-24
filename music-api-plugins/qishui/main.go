package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/SolitudeKing/music-lib/model"
	"github.com/SolitudeKing/music-lib/soda"
	qrcode "github.com/skip2/go-qrcode"
)

const (
	pluginVersion       = "1.0.0"
	maxAudioBytes int64 = 160 * 1024 * 1024
	maxCacheBytes int64 = 512 * 1024 * 1024
)

var sourceCommit = "development"

type server struct {
	port       int
	dataDir    string
	cacheDir   string
	httpClient *http.Client

	cookieMu sync.RWMutex
	cookie   string

	qrMu sync.Mutex
	qrs  map[string]*qrSession

	infoMu sync.Mutex
	infos  map[string]downloadInfoEntry

	lockMu sync.Mutex
	locks  map[string]*sync.Mutex
}

type qrSession struct {
	key       string
	url       string
	image     string
	expiresAt time.Time
	client    *soda.Soda
}

type downloadInfoEntry struct {
	info      *soda.DownloadInfo
	expiresAt time.Time
}

func main() {
	port := flag.Int("port", 3013, "loopback HTTP port")
	dataDir := flag.String("data-dir", "", "plugin data directory")
	flag.Parse()
	if *port < 1024 || *port > 65535 {
		log.Fatal("port must be between 1024 and 65535")
	}
	if strings.TrimSpace(*dataDir) == "" {
		*dataDir = filepath.Join(os.TempDir(), "fe-monster-qishui-api")
	}
	absData, err := filepath.Abs(*dataDir)
	if err != nil {
		log.Fatal(err)
	}
	cacheDir := filepath.Join(absData, "audio-cache")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		log.Fatal(err)
	}

	s := &server{
		port:       *port,
		dataDir:    absData,
		cacheDir:   cacheDir,
		httpClient: &http.Client{Timeout: 90 * time.Second},
		qrs:        make(map[string]*qrSession),
		infos:      make(map[string]downloadInfoEntry),
		locks:      make(map[string]*sync.Mutex),
	}
	s.cookie = s.loadCookie()

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.health)
	mux.HandleFunc("/health", s.health)
	mux.HandleFunc("/search", s.search)
	mux.HandleFunc("/song/search", s.search)
	mux.HandleFunc("/music/search", s.search)
	mux.HandleFunc("/song/url", s.songURL)
	mux.HandleFunc("/song/play-url", s.songURL)
	mux.HandleFunc("/music/url", s.songURL)
	mux.HandleFunc("/audio", s.audio)
	mux.HandleFunc("/lyric", s.lyric)
	mux.HandleFunc("/lyrics", s.lyric)
	mux.HandleFunc("/playlist/tracks", s.playlistTracks)
	mux.HandleFunc("/playlist/track/all", s.playlistTracks)
	mux.HandleFunc("/playlist/detail", s.playlistTracks)
	mux.HandleFunc("/playlist/search", s.playlistSearch)
	mux.HandleFunc("/recommend/playlist", s.recommendedPlaylists)
	mux.HandleFunc("/top/playlist", s.recommendedPlaylists)
	mux.HandleFunc("/playlist", s.recommendedPlaylists)
	mux.HandleFunc("/user/playlist", s.userPlaylists)
	mux.HandleFunc("/user/playlists", s.userPlaylists)
	mux.HandleFunc("/login/status", s.loginStatus)
	mux.HandleFunc("/user/account", s.loginStatus)
	mux.HandleFunc("/account/status", s.loginStatus)
	mux.HandleFunc("/login/qr/key", s.loginQRKey)
	mux.HandleFunc("/login/qr/create", s.loginQRCreate)
	mux.HandleFunc("/login/qr/check", s.loginQRCheck)
	mux.HandleFunc("/song/comments", unsupported("汽水评论接口未由 music-lib 提供"))
	mux.HandleFunc("/playlist/add", unsupported("汽水歌单写入接口未由 music-lib 提供"))

	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("FE Monster Qishui API plugin %s listening on 127.0.0.1:%d", pluginVersion, *port)
	httpServer := &http.Server{
		Handler:           localMiddleware(mux),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       75 * time.Second,
	}
	log.Fatal(httpServer.Serve(listener))
}

func localMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" && isLoopbackOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Add("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Cache-Control")
		w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "method not allowed"}, nil)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isLoopbackOrigin(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return (parsed.Scheme == "http" || parsed.Scheme == "https") && (host == "127.0.0.1" || host == "localhost" || host == "::1")
}

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" && r.URL.Path != "/health" {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "not found"}, nil)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "provider": "qishui", "label": "汽水音乐", "version": pluginVersion,
		"sourceCommit": sourceCommit, "loggedIn": hasSodaSession(s.requestCookie(r)),
		"capabilities": []string{"search", "playback-decrypt", "lyrics", "playlist-search", "playlist-tracks", "user-playlists", "qr-login"},
	}, nil)
}

func (s *server) search(w http.ResponseWriter, r *http.Request) {
	keyword := firstNonBlank(r.URL.Query().Get("q"), r.URL.Query().Get("key"), r.URL.Query().Get("keyword"), r.URL.Query().Get("keywords"))
	if keyword == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "search keyword is required"}, nil)
		return
	}
	songs, err := soda.New(s.requestCookie(r)).Search(keyword)
	if err != nil {
		writeUpstreamError(w, err)
		return
	}
	page, limit := pageLimit(r, 30, 100)
	items := paginateSongs(songs, page, limit)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "code": 200, "provider": "qishui", "songs": songMaps(items), "result": map[string]any{"songs": songMaps(items)}}, nil)
}

func (s *server) songURL(w http.ResponseWriter, r *http.Request) {
	id := songID(r)
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "playable": false, "error": "song id is required"}, nil)
		return
	}
	cookie := s.requestCookie(r)
	info, err := s.downloadInfo(id, cookie)
	if err != nil || info == nil || strings.TrimSpace(info.URL) == "" {
		if err == nil {
			err = fmt.Errorf("audio source is unavailable")
		}
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "playable": false, "provider": "qishui", "error": safeError(err)}, nil)
		return
	}
	localURL := fmt.Sprintf("http://127.0.0.1:%d/audio?id=%s", s.port, url.QueryEscape(id))
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "code": 200, "provider": "qishui", "url": localURL, "playUrl": localURL,
		"playable": true, "format": info.Format, "quality": info.Quality, "bitrate": info.Bitrate, "duration": info.Duration,
	}, nil)
}

func (s *server) audio(w http.ResponseWriter, r *http.Request) {
	id := songID(r)
	if id == "" {
		http.Error(w, "song id is required", http.StatusBadRequest)
		return
	}
	path, format, err := s.ensureAudio(id, s.requestCookie(r))
	if err != nil {
		http.Error(w, safeError(err), http.StatusBadGateway)
		return
	}
	file, err := os.Open(path)
	if err != nil {
		http.Error(w, "cached audio is unavailable", http.StatusInternalServerError)
		return
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil {
		http.Error(w, "cached audio metadata is unavailable", http.StatusInternalServerError)
		return
	}
	extension := strings.TrimPrefix(strings.ToLower(format), ".")
	contentType := mime.TypeByExtension("." + extension)
	if extension == "mp4" || extension == "m4a" || extension == "m4s" {
		contentType = "audio/mp4"
	}
	if contentType == "" {
		contentType = "audio/mp4"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, id+"."+strings.TrimPrefix(format, "."), stat.ModTime(), file)
}

func (s *server) lyric(w http.ResponseWriter, r *http.Request) {
	id := songID(r)
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "song id is required"}, nil)
		return
	}
	lyrics, err := soda.New(s.requestCookie(r)).GetLyrics(&model.Song{ID: id, Source: "soda", Extra: map[string]string{"track_id": id}})
	if err != nil {
		writeUpstreamError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "code": 200, "lyric": lyrics, "lrc": map[string]any{"lyric": lyrics}}, nil)
}

func (s *server) playlistSearch(w http.ResponseWriter, r *http.Request) {
	keyword := firstNonBlank(r.URL.Query().Get("q"), r.URL.Query().Get("keyword"), r.URL.Query().Get("keywords"))
	if keyword == "" {
		keyword = "热门音乐"
	}
	playlists, err := soda.New(s.requestCookie(r)).SearchPlaylist(keyword)
	if err != nil {
		writeUpstreamError(w, err)
		return
	}
	page, limit := pageLimit(r, 20, 50)
	items := paginatePlaylists(playlists, page, limit)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "code": 200, "provider": "qishui", "playlists": playlistMaps(items, false)}, nil)
}

func (s *server) recommendedPlaylists(w http.ResponseWriter, r *http.Request) {
	playlists, err := soda.New(s.requestCookie(r)).SearchPlaylist("热门音乐")
	if err != nil {
		writeUpstreamError(w, err)
		return
	}
	_, limit := pageLimit(r, 20, 30)
	if len(playlists) > limit {
		playlists = playlists[:limit]
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "code": 200, "provider": "qishui", "source": "playlist-search-fallback",
		"note": "汽水 PC 接口没有稳定的每日推荐歌单，当前展示热门歌单搜索结果", "playlists": playlistMaps(playlists, true),
	}, nil)
}

func (s *server) playlistTracks(w http.ResponseWriter, r *http.Request) {
	id := firstNonBlank(r.URL.Query().Get("id"), r.URL.Query().Get("ids"), r.URL.Query().Get("disstid"), r.URL.Query().Get("listid"))
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "playlist id is required"}, nil)
		return
	}
	songs, err := soda.New(s.requestCookie(r)).GetPlaylistSongs(id)
	if err != nil {
		writeUpstreamError(w, err)
		return
	}
	_, limit := pageLimit(r, len(songs), 100000)
	if limit > 0 && len(songs) > limit {
		songs = songs[:limit]
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "code": 200, "provider": "qishui", "songs": songMaps(songs), "tracks": songMaps(songs)}, nil)
}

func (s *server) userPlaylists(w http.ResponseWriter, r *http.Request) {
	cookie := s.requestCookie(r)
	if !hasSodaSession(cookie) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "code": 200, "loggedIn": false, "provider": "qishui", "playlists": []any{}}, nil)
		return
	}
	page, limit := pageLimit(r, 30, 100)
	playlists, err := soda.New(cookie).GetUserPlaylists(page, limit)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "loggedIn": false, "provider": "qishui", "playlists": []any{}, "error": safeError(err)}, nil)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "code": 200, "loggedIn": true, "provider": "qishui", "playlists": playlistMaps(playlists, false)}, nil)
}

func (s *server) loginStatus(w http.ResponseWriter, r *http.Request) {
	cookie := s.requestCookie(r)
	loggedIn := hasSodaSession(cookie)
	values := parseCookie(cookie)
	uid := firstCookie(values, "uid_tt", "uid_tt_ss")
	nickname := ""
	if loggedIn {
		nickname = "汽水音乐用户"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "code": 200, "provider": "qishui", "loggedIn": loggedIn,
		"account": map[string]any{"userId": uid, "nickname": nickname, "avatarUrl": ""},
	}, nil)
}

func (s *server) loginQRKey(w http.ResponseWriter, r *http.Request) {
	session, err := s.createQRSession()
	if err != nil {
		writeUpstreamError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, qrPayload(session), nil)
}

func (s *server) loginQRCreate(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimSpace(r.URL.Query().Get("key"))
	s.qrMu.Lock()
	session := s.qrs[key]
	s.qrMu.Unlock()
	if session == nil || time.Now().After(session.expiresAt) {
		var err error
		session, err = s.createQRSession()
		if err != nil {
			writeUpstreamError(w, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, qrPayload(session), nil)
}

func (s *server) loginQRCheck(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimSpace(firstNonBlank(r.URL.Query().Get("key"), r.URL.Query().Get("unikey")))
	baseKey := strings.SplitN(key, "|", 2)[0]
	s.qrMu.Lock()
	session := s.qrs[baseKey]
	s.qrMu.Unlock()
	if session == nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "code": 800, "message": "二维码会话不存在或已过期"}, nil)
		return
	}
	result, err := session.client.CheckQRLogin(key)
	if err != nil {
		writeUpstreamError(w, err)
		return
	}
	code := 801
	switch result.Status {
	case model.QRLoginStatusScanned:
		code = 802
	case model.QRLoginStatusSuccess:
		code = 803
	case model.QRLoginStatusExpired:
		code = 800
	case model.QRLoginStatusFailed:
		code = 500
	}
	message := strings.TrimSpace(result.Message)
	if result.Extra != nil && result.Extra["need_sms"] == "true" {
		message = "扫码已确认，但账号需要二次验证；请改用官方浏览器登录完成验证"
	}
	responseCookies := result.Cookies
	if result.Status == model.QRLoginStatusSuccess {
		cookie := strings.TrimSpace(result.Cookie)
		if cookie == "" {
			cookie = joinCookies(result.Cookies)
		}
		if cookie != "" {
			s.setCookie(cookie)
		}
		s.qrMu.Lock()
		delete(s.qrs, baseKey)
		s.qrMu.Unlock()
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": result.Status != model.QRLoginStatusFailed, "code": code, "status": code,
		"provider": "qishui", "loggedIn": result.Status == model.QRLoginStatusSuccess,
		"message": message, "data": map[string]any{"status": code},
	}, responseCookies)
}

func (s *server) createQRSession() (*qrSession, error) {
	client := soda.New(s.storedCookie())
	upstream, err := client.CreateQRLogin()
	if err != nil {
		return nil, err
	}
	image := strings.TrimSpace(upstream.ImageURL)
	if image == "" {
		png, err := qrcode.Encode(upstream.URL, qrcode.Medium, 360)
		if err != nil {
			return nil, fmt.Errorf("render qishui login qr: %w", err)
		}
		image = "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)
	}
	expires := time.Unix(upstream.ExpiresAt, 0)
	if upstream.ExpiresAt <= 0 {
		expires = time.Now().Add(5 * time.Minute)
	}
	session := &qrSession{key: upstream.Key, url: upstream.URL, image: image, expiresAt: expires, client: client}
	s.qrMu.Lock()
	for key, old := range s.qrs {
		if time.Now().After(old.expiresAt.Add(time.Minute)) {
			delete(s.qrs, key)
		}
	}
	s.qrs[session.key] = session
	s.qrMu.Unlock()
	return session, nil
}

func qrPayload(session *qrSession) map[string]any {
	return map[string]any{
		"ok": true, "code": 200, "provider": "qishui", "key": session.key, "url": session.url, "qrimg": session.image,
		"data": map[string]any{"key": session.key, "token": session.key, "url": session.url, "qrimg": session.image, "qrcode_img": session.image},
	}
}

func (s *server) downloadInfo(id, cookie string) (*soda.DownloadInfo, error) {
	cacheKey := id + "|" + cookieFingerprint(cookie)
	s.infoMu.Lock()
	entry, ok := s.infos[cacheKey]
	if ok && time.Now().Before(entry.expiresAt) {
		s.infoMu.Unlock()
		return entry.info, nil
	}
	s.infoMu.Unlock()
	info, err := soda.New(cookie).GetDownloadInfo(&model.Song{ID: id, Source: "soda", Extra: map[string]string{"track_id": id}})
	if err != nil {
		return nil, err
	}
	s.infoMu.Lock()
	s.infos[cacheKey] = downloadInfoEntry{info: info, expiresAt: time.Now().Add(4 * time.Minute)}
	s.infoMu.Unlock()
	return info, nil
}

func (s *server) ensureAudio(id, cookie string) (string, string, error) {
	key := hashText(id + "\x00" + cookieFingerprint(cookie))
	path := filepath.Join(s.cacheDir, key+".media")
	lock := s.trackLock(key)
	lock.Lock()
	defer lock.Unlock()
	if stat, err := os.Stat(path); err == nil && stat.Size() > 0 {
		_ = os.Chtimes(path, time.Now(), time.Now())
		return path, "m4a", nil
	}

	var info *soda.DownloadInfo
	var raw []byte
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		info, err = s.downloadInfo(id, cookie)
		if err == nil {
			raw, err = s.fetchAudioSource(info)
		}
		if err == nil {
			break
		}
		s.invalidateDownloadInfo(id, cookie)
	}
	if err != nil {
		return "", "", err
	}
	decoded := raw
	if strings.TrimSpace(info.PlayAuth) != "" {
		decoded, err = soda.DecryptAudio(raw, info.PlayAuth)
		if err != nil {
			return "", "", fmt.Errorf("qishui audio decrypt failed: %w", err)
		}
	}
	temp, err := os.CreateTemp(s.cacheDir, key+"-*.tmp")
	if err != nil {
		return "", "", err
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)
	if _, err = temp.Write(decoded); err == nil {
		err = temp.Sync()
	}
	if closeErr := temp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return "", "", err
	}
	if err := os.Rename(tempPath, path); err != nil {
		return "", "", err
	}
	s.pruneCache(path)
	format := strings.TrimSpace(info.Format)
	if format == "" {
		format = "m4a"
	}
	return path, format, nil
}

func (s *server) fetchAudioSource(info *soda.DownloadInfo) ([]byte, error) {
	if info == nil || strings.TrimSpace(info.URL) == "" {
		return nil, fmt.Errorf("qishui audio source is unavailable")
	}
	req, err := http.NewRequest(http.MethodGet, info.URL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", soda.UserAgent)
	req.Header.Set("Referer", "https://www.qishui.com/")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("qishui audio upstream HTTP %d", resp.StatusCode)
	}
	if resp.ContentLength > maxAudioBytes {
		return nil, fmt.Errorf("qishui audio exceeds local proxy limit")
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxAudioBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(raw)) > maxAudioBytes {
		return nil, fmt.Errorf("qishui audio exceeds local proxy limit")
	}
	return raw, nil
}

func (s *server) invalidateDownloadInfo(id, cookie string) {
	cacheKey := id + "|" + cookieFingerprint(cookie)
	s.infoMu.Lock()
	delete(s.infos, cacheKey)
	s.infoMu.Unlock()
}

func (s *server) trackLock(key string) *sync.Mutex {
	s.lockMu.Lock()
	defer s.lockMu.Unlock()
	lock := s.locks[key]
	if lock == nil {
		lock = &sync.Mutex{}
		s.locks[key] = lock
	}
	return lock
}

func (s *server) pruneCache(keep string) {
	entries, err := os.ReadDir(s.cacheDir)
	if err != nil {
		return
	}
	type cacheFile struct {
		path string
		size int64
		mod  time.Time
	}
	files := make([]cacheFile, 0, len(entries))
	var total int64
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".media") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		path := filepath.Join(s.cacheDir, entry.Name())
		files = append(files, cacheFile{path: path, size: info.Size(), mod: info.ModTime()})
		total += info.Size()
	}
	if total <= maxCacheBytes {
		return
	}
	sort.Slice(files, func(i, j int) bool { return files[i].mod.Before(files[j].mod) })
	for _, file := range files {
		if total <= maxCacheBytes || file.path == keep {
			continue
		}
		if os.Remove(file.path) == nil {
			total -= file.size
		}
	}
}

func (s *server) requestCookie(r *http.Request) string {
	value := strings.TrimSpace(r.URL.Query().Get("cookie"))
	if value == "" {
		value = strings.TrimSpace(r.Header.Get("Cookie"))
	}
	if value == "" {
		value = s.storedCookie()
	}
	return value
}

func (s *server) storedCookie() string {
	s.cookieMu.RLock()
	defer s.cookieMu.RUnlock()
	return s.cookie
}

func (s *server) loadCookie() string {
	if value := strings.TrimSpace(os.Getenv("QISHUI_COOKIE")); value != "" {
		return value
	}
	data, err := os.ReadFile(filepath.Join(s.dataDir, "cookie.txt"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func (s *server) setCookie(value string) {
	value = strings.TrimSpace(value)
	if value == "" {
		return
	}
	s.cookieMu.Lock()
	s.cookie = value
	s.cookieMu.Unlock()
	_ = os.MkdirAll(s.dataDir, 0o755)
	temp, err := os.CreateTemp(s.dataDir, "cookie-*.tmp")
	if err != nil {
		return
	}
	name := temp.Name()
	defer os.Remove(name)
	if _, err = temp.WriteString(value); err == nil {
		err = temp.Sync()
	}
	if closeErr := temp.Close(); err == nil {
		err = closeErr
	}
	if err == nil {
		_ = os.Rename(name, filepath.Join(s.dataDir, "cookie.txt"))
	}
}

func pageLimit(r *http.Request, defaultLimit, maxLimit int) (int, int) {
	page := parsePositive(firstNonBlank(r.URL.Query().Get("page"), r.URL.Query().Get("pageNo")), 1)
	limit := parsePositive(firstNonBlank(r.URL.Query().Get("limit"), r.URL.Query().Get("pageSize"), r.URL.Query().Get("pagesize")), defaultLimit)
	if maxLimit > 0 && limit > maxLimit {
		limit = maxLimit
	}
	return page, limit
}

func parsePositive(raw string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func paginateSongs(items []model.Song, page, limit int) []model.Song {
	start := (page - 1) * limit
	if start >= len(items) {
		return []model.Song{}
	}
	end := start + limit
	if end > len(items) {
		end = len(items)
	}
	return items[start:end]
}

func paginatePlaylists(items []model.Playlist, page, limit int) []model.Playlist {
	start := (page - 1) * limit
	if start >= len(items) {
		return []model.Playlist{}
	}
	end := start + limit
	if end > len(items) {
		end = len(items)
	}
	return items[start:end]
}

func songMaps(songs []model.Song) []map[string]any {
	items := make([]map[string]any, 0, len(songs))
	for _, song := range songs {
		items = append(items, map[string]any{
			"id": song.ID, "name": song.Name, "title": song.Name, "artist": song.Artist, "album": song.Album,
			"album_id": song.AlbumID, "duration": song.Duration, "size": song.Size, "bitrate": song.Bitrate,
			"source": "soda", "provider": "qishui", "cover": song.Cover, "link": song.Link,
			"ext": song.Ext, "is_vip": song.IsVIP, "is_invalid": song.IsInvalid, "extra": song.Extra,
		})
	}
	return items
}

func playlistMaps(playlists []model.Playlist, recommended bool) []map[string]any {
	items := make([]map[string]any, 0, len(playlists))
	for _, playlist := range playlists {
		items = append(items, map[string]any{
			"id": playlist.ID, "name": playlist.Name, "cover": playlist.Cover,
			"track_count": playlist.TrackCount, "trackCount": playlist.TrackCount,
			"play_count": playlist.PlayCount, "playCount": playlist.PlayCount,
			"creator": playlist.Creator, "description": playlist.Description, "source": "soda",
			"provider": "qishui", "link": playlist.Link, "extra": playlist.Extra, "recommended": recommended,
		})
	}
	return items
}

func songID(r *http.Request) string {
	return strings.TrimSpace(firstNonBlank(r.URL.Query().Get("id"), r.URL.Query().Get("songid"), r.URL.Query().Get("songId"), r.URL.Query().Get("track_id")))
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func parseCookie(raw string) map[string]string {
	result := make(map[string]string)
	for _, part := range strings.Split(raw, ";") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if ok && strings.TrimSpace(key) != "" && strings.TrimSpace(value) != "" {
			result[strings.TrimSpace(key)] = strings.TrimSpace(value)
		}
	}
	return result
}

func firstCookie(cookies map[string]string, names ...string) string {
	for _, name := range names {
		for key, value := range cookies {
			if strings.EqualFold(key, name) && strings.TrimSpace(value) != "" {
				return strings.TrimSpace(value)
			}
		}
	}
	return ""
}

func hasSodaSession(cookie string) bool {
	return firstCookie(parseCookie(cookie), "sessionid", "sessionid_ss", "sid_tt", "sid_guard") != ""
}

func joinCookies(cookies map[string]string) string {
	keys := make([]string, 0, len(cookies))
	for key := range cookies {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		if safeCookieName(key) && strings.TrimSpace(cookies[key]) != "" {
			parts = append(parts, key+"="+strings.TrimSpace(cookies[key]))
		}
	}
	return strings.Join(parts, "; ")
}

func safeCookieName(value string) bool {
	if value == "" {
		return false
	}
	for _, char := range value {
		if !((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '_' || char == '-') {
			return false
		}
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, payload any, cookies map[string]string) {
	for key, value := range cookies {
		value = strings.TrimSpace(value)
		if safeCookieName(key) && value != "" && !strings.ContainsAny(value, "\r\n") {
			w.Header().Add("Set-Cookie", key+"="+value+"; Path=/; HttpOnly; SameSite=Lax")
		}
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	if r, ok := payload.(map[string]any); ok {
		if _, exists := r["code"]; !exists {
			r["code"] = status
		}
	}
	_ = json.NewEncoder(w).Encode(payload)
}

func writeUpstreamError(w http.ResponseWriter, err error) {
	writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "provider": "qishui", "error": safeError(err)}, nil)
}

func unsupported(message string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotImplemented, map[string]any{"ok": false, "provider": "qishui", "error": message}, nil)
	}
}

func safeError(err error) string {
	if err == nil {
		return "unknown error"
	}
	message := strings.TrimSpace(err.Error())
	if message == "" {
		return "unknown error"
	}
	if len(message) > 300 {
		message = message[:300]
	}
	return message
}

func cookieFingerprint(cookie string) string {
	sum := sha256.Sum256([]byte(cookie))
	return hex.EncodeToString(sum[:8])
}

func hashText(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
