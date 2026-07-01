package com.femonster.model;

import com.femonster.json.SimpleJson;

import java.util.LinkedHashMap;
import java.util.Map;

public final class Song {
    public String id = "";
    public String title = "";
    public String artist = "";
    public String album = "";
    public String cover = "";
    public String provider = "netease";
    public int duration = 0;

    public static Song empty() {
        Song song = new Song();
        song.title = "FE Player";
        return song;
    }

    public static Song fromMap(Map<String, Object> map) {
        Song song = new Song();
        song.id = SimpleJson.asString(map.get("id"), "");
        song.title = SimpleJson.asString(map.get("title"), SimpleJson.asString(map.get("name"), ""));
        song.artist = SimpleJson.asString(map.get("artist"), "");
        song.album = SimpleJson.asString(map.get("album"), "");
        song.cover = SimpleJson.asString(map.get("cover"), "");
        song.provider = SimpleJson.asString(map.get("provider"), "netease");
        song.duration = SimpleJson.asInt(map.get("duration"), 0);
        return song;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", id);
        map.put("title", title);
        map.put("artist", artist);
        map.put("album", album);
        map.put("cover", cover);
        map.put("provider", provider);
        map.put("duration", duration);
        return map;
    }

    public Map<String, Object> toQueueMap(int index, boolean current) {
        Map<String, Object> map = toMap();
        map.put("queueIndex", index);
        map.put("current", current);
        return map;
    }

    public boolean hasIdentity() {
        return id != null && !id.isBlank();
    }

    public String displayTitle() {
        return title == null || title.isBlank() ? "Untitled" : title;
    }
}
