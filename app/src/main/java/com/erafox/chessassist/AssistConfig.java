// Java / AssistConfig.java / Android 7+ / settings model stored in SharedPreferences.
package com.erafox.chessassist;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

public class AssistConfig {

    public int accuracy = 78;
    public boolean accuracyOn = false;
    public int rating = 1500;
    public boolean multi = false;
    public boolean arrows = false;
    public boolean auto = false;
    public boolean timing = true;
    public boolean focusPause = true;
    public boolean weakMoves = false;
    public boolean proctorGuard = true;
    public int fromColor = 0xFF14B8A6;
    public int toColor = 0xFF14B8A6;
    public int arrowColor = 0xFF14B8A6;

    private static final String PREFS = "chess_assist";

    public static AssistConfig load(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        AssistConfig a = new AssistConfig();
        a.accuracy = clamp(p.getInt("accuracy", a.accuracy), 20, 100);
        a.accuracyOn = p.getBoolean("accuracyOn", a.accuracyOn);
        a.rating = 1500;
        a.multi = p.getBoolean("multi", a.multi);
        a.arrows = p.getBoolean("arrows", a.arrows);
        // v2: squares are the new default. Old installs stored the previous
        // arrow default without the user ever choosing it, so migrate once.
        if (p.getInt("cfgVersion", 0) < 2) a.arrows = false;
        a.auto = p.getBoolean("auto", a.auto);
        a.timing = p.getBoolean("timing", a.timing);
        a.focusPause = p.getBoolean("focusPause", a.focusPause);
        a.weakMoves = p.getBoolean("weakMoves", a.weakMoves);
        // v3: scripted blunders are gone. Elo adaptation does the variance now.
        if (p.getInt("cfgVersion", 0) < 3) a.weakMoves = false;
        // v4: nothing is enabled on a fresh bench; every switch starts off.
        if (p.getInt("cfgVersion", 0) < 4) {
            a.accuracyOn = false;
            a.multi = false;
            a.auto = false;
        }
        a.proctorGuard = p.getBoolean("proctorGuard", a.proctorGuard);
        a.fromColor = p.getInt("fromColor", a.fromColor);
        a.toColor = p.getInt("toColor", a.toColor);
        a.arrowColor = p.getInt("arrowColor", a.arrowColor);
        return a;
    }

    public void save(Context c) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putInt("accuracy", accuracy)
                .putBoolean("accuracyOn", accuracyOn)
                .putInt("rating", rating)
                .putBoolean("multi", multi)
                .putBoolean("arrows", arrows)
                .putBoolean("auto", auto)
                .putBoolean("timing", timing)
                .putBoolean("focusPause", focusPause)
                .putBoolean("weakMoves", weakMoves)
                .putBoolean("proctorGuard", proctorGuard)
                .putInt("fromColor", fromColor)
                .putInt("toColor", toColor)
                .putInt("arrowColor", arrowColor)
                .putInt("cfgVersion", 4)
                .apply();
    }

    public void reset() {
        accuracy = 78;
        accuracyOn = false;
        rating = 1500;
        multi = false;
        arrows = false;
        auto = false;
        timing = true;
        focusPause = true;
        weakMoves = false;
        proctorGuard = true;
        fromColor = 0xFF14B8A6;
        toColor = 0xFF14B8A6;
        arrowColor = 0xFF14B8A6;
    }

    public String json() {
        try {
            JSONObject o = new JSONObject();
            o.put("accuracy", accuracy);
            o.put("accuracyOn", accuracyOn);
            o.put("rating", rating);
            o.put("multi", multi);
            o.put("auto", auto);
            o.put("timing", timing);
            o.put("focusPause", focusPause);
            o.put("weakMoves", weakMoves);
            o.put("proctorGuard", proctorGuard);
            o.put("style", arrows ? "arrows" : "squares");
            o.put("fromColor", hex(fromColor));
            o.put("toColor", hex(toColor));
            o.put("arrowColor", hex(arrowColor));
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    public static String hex(int argb) {
        return String.format("#%06X", 0xFFFFFF & argb);
    }

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
