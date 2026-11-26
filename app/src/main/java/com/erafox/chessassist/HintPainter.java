// Java / HintPainter.java / Android 7+ / one-line arrows, flat squares, bare digits.
package com.erafox.chessassist;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;

public final class HintPainter {

    private HintPainter() {}

    public static int alpha(int color, float mul) {
        int a = Math.round(Color.alpha(color) * clamp(mul, 0f, 1f));
        return Color.argb(a, Color.red(color), Color.green(color), Color.blue(color));
    }

    public static void squares(Canvas c, RectF from, RectF to, int fromColor, int toColor,
                               float mul, float unit) {
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(alpha(fromColor, 0.55f * mul));
        c.drawRect(from, fill);
        fill.setColor(alpha(toColor, 0.62f * mul));
        c.drawRect(to, fill);
    }

    // One line. No shaft/head split, no rim, no extra shapes.
    public static void arrow(Canvas c, float sx, float sy, float ex, float ey,
                             int color, float width, float mul) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(alpha(color, mul));
        p.setStrokeWidth(width);
        c.drawLine(sx, sy, ex, ey, p);
    }

    // Digits sit directly on the square, stretched to fill the whole cell.
    // No plate, no frame, no background.
    public static void label(Canvas c, String text, float cx, float cy,
                             float box, float unit, float mul) {
        if (text == null || text.isEmpty() || box < 2f) return;
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        p.setTextSize(box * 1.16f);
        float tw = p.measureText(text);
        if (tw > 0.5f) p.setTextScaleX(Math.min(3.4f, (box * 0.94f) / tw));
        p.setTextAlign(Paint.Align.CENTER);
        p.setColor(alpha(0xFFFFFFFF, mul));
        p.setShadowLayer(3.5f * unit, 0f, 0f, 0xC2000000);
        Paint.FontMetrics fm = p.getFontMetrics();
        c.drawText(text, cx, cy - (fm.ascent + fm.descent) / 2f, p);
    }

    private static float clamp(float v, float lo, float hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
