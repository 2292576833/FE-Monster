package com.femonster.model;

import java.util.LinkedHashMap;
import java.util.Map;

public final class Playlist {
    public String id = "";
    public String name = "";
    public String cover = "";
    public int trackCount = 0;
    public long playCount = 0;
    public String creator = "";
    public String provider = "netease";

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", id);
        map.put("name", name);
        map.put("cover", cover);
        map.put("trackCount", trackCount);
        map.put("playCount", playCount);
        map.put("creator", creator);
        map.put("provider", provider);
        return map;
    }
}
