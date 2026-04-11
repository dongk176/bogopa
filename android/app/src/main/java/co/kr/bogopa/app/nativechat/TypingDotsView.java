package co.kr.bogopa.app.nativechat;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;

import androidx.annotation.NonNull;

final class TypingDotsView extends LinearLayout {
    private final View[] dots = new View[3];
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int activeIndex = 0;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            for (int i = 0; i < dots.length; i++) {
                View dot = dots[i];
                if (dot == null) continue;
                boolean active = i == activeIndex;
                dot.setAlpha(active ? 1f : 0.35f);
                dot.setTranslationY(active ? -dp(2) : 0);
                dot.setScaleX(active ? 1.12f : 1f);
                dot.setScaleY(active ? 1.12f : 1f);
            }
            activeIndex = (activeIndex + 1) % dots.length;
            handler.postDelayed(this, 240L);
        }
    };

    TypingDotsView(@NonNull Context context) {
        super(context);
        setOrientation(HORIZONTAL);
        setGravity(Gravity.CENTER);
        setClipChildren(false);
        setClipToPadding(false);
        setPadding(0, dp(2), 0, dp(1));

        int dotSize = dp(6);
        int spacing = dp(4);

        for (int i = 0; i < dots.length; i++) {
            View dot = new View(context);
            LayoutParams params = new LayoutParams(dotSize, dotSize);
            if (i > 0) {
                params.leftMargin = spacing;
            }
            dot.setLayoutParams(params);
            dot.setBackground(new DotDrawable(0xFF6A7480));
            dot.setAlpha(0.35f);
            dots[i] = dot;
            addView(dot);
        }
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        handler.removeCallbacks(ticker);
        handler.post(ticker);
    }

    @Override
    protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        handler.removeCallbacks(ticker);
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                value,
                getResources().getDisplayMetrics()
        ));
    }

    private static final class DotDrawable extends android.graphics.drawable.ShapeDrawable {
        DotDrawable(int color) {
            super(new android.graphics.drawable.shapes.OvalShape());
            getPaint().setColor(color);
            getPaint().setAntiAlias(true);
        }
    }
}
