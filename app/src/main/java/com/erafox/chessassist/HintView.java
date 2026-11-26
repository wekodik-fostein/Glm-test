// Java / HintView.java / Android 7+ / native hint layer: square fills or single lines.
package com.erafox.chessassist;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.RectF;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

public class HintView extends View {

    public static class Hint {
        public final float fx, fy, fs, tx, ty, ts;
        public final String label;
        public final boolean main;

        public Hint(float fx, float fy, float fs, float tx, float ty, float ts,
                    String label, boolean main) {
            this.fx = fx;
            this.fy = fy;
            this.fs = fs;
            this.tx = tx;
            this.ty = ty;
            this.ts = ts;
            this.label = label == null ? "" : label;
            this.main = main;
        }
    }

    private final List<Hint> hints = new ArrayList<>();
    private boolean arrows = true;
    private int fromColor = 0xFF14B8A6;
    private int toColor = 0xFF14B8A6;
    private int arrowColor = 0xFF14B8A6;
    private final float unit;

    public HintView(Context c) {
        super(c);
        setWillNotDraw(false);
        unit = getResources().getDisplayMetrics().density;
    }

    public void setStyle(boolean arrows, int fromColor, int toColor, int arrowColor) {
        this.arrows = arrows;
        this.fromColor = fromColor;
        this.toColor = toColor;
        this.arrowColor = arrowColor;
        invalidate();
    }

    public void setHints(List<Hint> list) {
        hints.clear();
        if (list != null) hints.addAll(list);
        invalidate();
    }

    public void clear() {
        if (hints.isEmpty()) return;
        hints.clear();
        invalidate();
    }

    @Override
    protected void onDraw(Canvas c) {
        super.onDraw(c);
        if (hints.isEmpty()) return;

        for (int pass = 0; pass < 2; pass++) {
            for (int i = 0; i < hints.size(); i++) {
                Hint h = hints.get(i);
                if ((pass == 1) != h.main) continue;
                float mul = h.main ? 1f : 0.66f;
                if (arrows) drawArrow(c, h, mul);
                else drawSquares(c, h, mul);
            }
        }
        // Digits always on top, never trapped under a line.
        for (int i = 0; i < hints.size(); i++) {
            Hint h = hints.get(i);
            if (h.label.isEmpty()) continue;
            drawLabel(c, h, h.main ? 1f : 0.8f);
        }
    }

    private void drawArrow(Canvas c, Hint h, float mul) {
        float width = (h.main ? 3.2f : 2.4f) * unit;
        HintPainter.arrow(c,
                h.fx + h.fs / 2f, h.fy + h.fs / 2f,
                h.tx + h.ts / 2f, h.ty + h.ts / 2f,
                arrowColor, width, mul);
    }

    private void drawSquares(Canvas c, Hint h, float mul) {
        RectF from = new RectF(h.fx, h.fy, h.fx + h.fs, h.fy + h.fs);
        RectF to = new RectF(h.tx, h.ty, h.tx + h.ts, h.ty + h.ts);
        HintPainter.squares(c, from, to, fromColor, toColor, mul, unit);
    }

    private void drawLabel(Canvas c, Hint h, float mul) {
        HintPainter.label(c, h.label,
                h.tx + h.ts / 2f, h.ty + h.ts / 2f, h.ts * 0.98f, unit, mul);
    }
}
