// Java / AvatarButtonView.java / Android 7+ / borderless round profile photo: tap opens the GUI, drag moves it.
package com.erafox.chessassist;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;

import java.io.InputStream;

public class AvatarButtonView extends View {

    private final Bitmap bitmap;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path clip = new Path();
    private final RectF rect = new RectF();
    private final int slop;

    private float downRawX, downRawY, startX, startY;
    private boolean dragging;

    public AvatarButtonView(Context c, String asset) {
        super(c);
        Bitmap b = null;
        try {
            InputStream in = c.getAssets().open(asset);
            b = BitmapFactory.decodeStream(in);
            in.close();
        } catch (Exception ignored) {}
        bitmap = b;
        slop = ViewConfiguration.get(c).getScaledTouchSlop();
        setClickable(true);
        setFocusable(true);
    }

    @Override
    protected void onMeasure(int w, int h) {
        int size = Math.round(48 * getResources().getDisplayMetrics().density);
        setMeasuredDimension(size, size);
    }

    @Override
    protected void onDraw(Canvas c) {
        super.onDraw(c);
        float w = getWidth(), h = getHeight();
        rect.set(0, 0, w, h);
        clip.reset();
        clip.addOval(rect, Path.Direction.CW);
        c.save();
        c.clipPath(clip);
        if (bitmap != null) {
            float scale = Math.max(w / bitmap.getWidth(), h / bitmap.getHeight());
            float dw = bitmap.getWidth() * scale, dh = bitmap.getHeight() * scale;
            c.drawBitmap(bitmap, null,
                    new RectF((w - dw) / 2f, (h - dh) / 2f, (w + dw) / 2f, (h + dh) / 2f), paint);
        } else {
            paint.setColor(0xFF000000);
            c.drawRect(rect, paint);
        }
        c.restore();
    }

    @Override
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        super.onLayout(changed, l, t, r, b);
        if (changed) clampIntoParent();
    }

    private void clampIntoParent() {
        View p = (View) getParent();
        if (p == null) return;
        float maxX = Math.max(0, p.getWidth() - getWidth());
        float maxY = Math.max(0, p.getHeight() - getHeight());
        float x = Math.max(0, Math.min(maxX, getX()));
        float y = Math.max(0, Math.min(maxY, getY()));
        if (x != getX()) setX(x);
        if (y != getY()) setY(y);
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downRawX = e.getRawX();
                downRawY = e.getRawY();
                startX = getX();
                startY = getY();
                dragging = false;
                setAlpha(0.72f);
                return true;
            case MotionEvent.ACTION_MOVE: {
                float dx = e.getRawX() - downRawX;
                float dy = e.getRawY() - downRawY;
                if (!dragging && Math.hypot(dx, dy) > slop) dragging = true;
                if (dragging) {
                    View p = (View) getParent();
                    if (p != null) {
                        float maxX = Math.max(0, p.getWidth() - getWidth());
                        float maxY = Math.max(0, p.getHeight() - getHeight());
                        setX(Math.max(0, Math.min(maxX, startX + dx)));
                        setY(Math.max(0, Math.min(maxY, startY + dy)));
                    }
                }
                return true;
            }
            case MotionEvent.ACTION_UP:
                setAlpha(1f);
                if (!dragging) performClick();
                dragging = false;
                return true;
            case MotionEvent.ACTION_CANCEL:
                setAlpha(1f);
                dragging = false;
                return true;
        }
        return super.onTouchEvent(e);
    }

    @Override
    public boolean performClick() {
        return super.performClick();
    }
}
