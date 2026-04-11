package co.kr.bogopa.app.nativechat;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.text.Editable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import co.kr.bogopa.app.R;

public class NativeChatActivity extends AppCompatActivity {
    private static final int COLOR_BRAND = Color.rgb(62, 85, 96);
    private static final int COLOR_TEXT = Color.rgb(47, 52, 46);
    private static final int COLOR_SUBTLE_TEXT = Color.rgb(100, 116, 139);
    private static final int COLOR_ASSISTANT_BUBBLE = Color.rgb(227, 232, 235);
    private static final int COLOR_USER_BUBBLE = Color.rgb(205, 230, 244);
    private static final int COLOR_PAGE_BG = Color.WHITE;
    private static final int COLOR_FALLBACK_BG = Color.rgb(230, 233, 226);

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService imageExecutor = Executors.newCachedThreadPool();

    private LinearLayout headerContainer;
    private ImageView headerAvatarView;
    private TextView titleView;
    private LinearLayout memoryBadgeView;
    private TextView memoryValueView;

    private ScrollView messageScrollView;
    private LinearLayout messageStack;

    private LinearLayout composerContainer;
    private EditText inputView;
    private ImageButton sendButton;

    private TextView blockedNoticeView;

    private FrameLayout sheetBackdrop;
    private LinearLayout sheetPanel;
    private LinearLayout sheetList;
    private boolean isSheetVisible = false;
    private int lastImeOffset = 0;

    private NativeChatState currentState;
    private String currentAvatarUrl;
    private Bitmap currentAvatarBitmap;
    private boolean shouldEmitCloseOnDestroy = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        FrameLayout root = buildLayout();
        setContentView(root);
        setupWindowInsets(root);

        NativeChatBridge.registerActivity(this);
        NativeChatState latest = NativeChatBridge.getState();
        if (latest != null) {
            applyStateFromPlugin(latest);
        }
    }

    @Override
    protected void onDestroy() {
        NativeChatBridge.unregisterActivity(this);
        imageExecutor.shutdownNow();
        if (shouldEmitCloseOnDestroy && !isChangingConfigurations()) {
            NativeChatBridge.emitClose();
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (isSheetVisible) {
            hidePersonaSheet();
            return;
        }
        finishByUserAction();
    }

    void dismissFromPlugin() {
        shouldEmitCloseOnDestroy = false;
        finish();
    }

    void applyStateFromPlugin(NativeChatState state) {
        if (state == null) return;
        runOnUiThread(() -> applyState(state));
    }

    private void finishByUserAction() {
        shouldEmitCloseOnDestroy = true;
        finish();
    }

    private FrameLayout buildLayout() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(COLOR_PAGE_BG);

        LinearLayout main = new LinearLayout(this);
        main.setOrientation(LinearLayout.VERTICAL);
        main.setBackgroundColor(COLOR_PAGE_BG);
        root.addView(main, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        headerContainer = new LinearLayout(this);
        headerContainer.setOrientation(LinearLayout.HORIZONTAL);
        headerContainer.setGravity(Gravity.CENTER_VERTICAL);
        headerContainer.setBackgroundColor(Color.WHITE);
        headerContainer.setPadding(dp(12), dp(4), dp(12), dp(8));
        main.addView(headerContainer, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        ImageButton backButton = new ImageButton(this);
        backButton.setImageResource(androidx.appcompat.R.drawable.abc_ic_ab_back_material);
        backButton.setBackgroundColor(Color.TRANSPARENT);
        backButton.setColorFilter(COLOR_BRAND);
        backButton.setOnClickListener(v -> onBackPressed());
        LinearLayout.LayoutParams backParams = new LinearLayout.LayoutParams(dp(36), dp(36));
        headerContainer.addView(backButton, backParams);

        LinearLayout personaButton = new LinearLayout(this);
        personaButton.setOrientation(LinearLayout.HORIZONTAL);
        personaButton.setGravity(Gravity.CENTER_VERTICAL);
        personaButton.setPadding(dp(6), dp(6), dp(6), dp(6));
        personaButton.setOnClickListener(v -> {
            if (currentState == null) return;
            showPersonaSheet();
        });
        LinearLayout.LayoutParams personaButtonParams = new LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                1f
        );
        headerContainer.addView(personaButton, personaButtonParams);

        headerAvatarView = new ImageView(this);
        headerAvatarView.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable avatarBg = new GradientDrawable();
        avatarBg.setShape(GradientDrawable.RECTANGLE);
        avatarBg.setColor(Color.argb(13, 0, 0, 0));
        avatarBg.setCornerRadius(dp(10));
        headerAvatarView.setBackground(avatarBg);
        personaButton.addView(headerAvatarView, new LinearLayout.LayoutParams(dp(36), dp(36)));

        LinearLayout titleRow = new LinearLayout(this);
        titleRow.setOrientation(LinearLayout.HORIZONTAL);
        titleRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams titleRowParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        titleRowParams.leftMargin = dp(10);
        personaButton.addView(titleRow, titleRowParams);

        titleView = new TextView(this);
        titleView.setTextColor(COLOR_TEXT);
        titleView.setTypeface(Typeface.DEFAULT);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        titleView.setSingleLine(true);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        titleView.setText("기억");
        titleRow.addView(titleView);

        ImageView chevron = new ImageView(this);
        chevron.setImageResource(R.drawable.ic_chevron_down_small);
        chevron.setColorFilter(COLOR_BRAND);
        LinearLayout.LayoutParams chevronParams = new LinearLayout.LayoutParams(dp(14), dp(14));
        chevronParams.leftMargin = dp(3);
        chevronParams.gravity = Gravity.CENTER_VERTICAL;
        titleRow.addView(chevron, chevronParams);

        memoryBadgeView = new LinearLayout(this);
        memoryBadgeView.setOrientation(LinearLayout.HORIZONTAL);
        memoryBadgeView.setGravity(Gravity.CENTER_VERTICAL);
        memoryBadgeView.setPadding(dp(12), dp(8), dp(12), dp(8));
        GradientDrawable memoryBadgeBg = new GradientDrawable();
        memoryBadgeBg.setColor(Color.rgb(244, 248, 250));
        memoryBadgeBg.setCornerRadius(dp(13));
        memoryBadgeView.setBackground(memoryBadgeBg);

        ImageView memoryIcon = new ImageView(this);
        memoryIcon.setImageResource(R.drawable.ic_memory_balance);
        memoryIcon.setColorFilter(COLOR_BRAND);
        LinearLayout.LayoutParams memoryIconParams = new LinearLayout.LayoutParams(dp(18), dp(18));
        memoryIconParams.gravity = Gravity.CENTER_VERTICAL;
        memoryBadgeView.addView(memoryIcon, memoryIconParams);

        memoryValueView = new TextView(this);
        memoryValueView.setTextColor(COLOR_BRAND);
        memoryValueView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        memoryValueView.setPadding(dp(6), 0, 0, 0);
        memoryBadgeView.addView(memoryValueView);

        headerContainer.addView(memoryBadgeView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        messageScrollView = new ScrollView(this);
        messageScrollView.setFillViewport(true);
        messageScrollView.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
        messageScrollView.setVerticalScrollBarEnabled(false);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
        );
        main.addView(messageScrollView, scrollParams);

        messageStack = new LinearLayout(this);
        messageStack.setOrientation(LinearLayout.VERTICAL);
        messageStack.setPadding(dp(12), dp(16), dp(12), dp(18));
        messageScrollView.addView(messageStack, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        composerContainer = new LinearLayout(this);
        composerContainer.setOrientation(LinearLayout.HORIZONTAL);
        composerContainer.setGravity(Gravity.CENTER_VERTICAL);
        composerContainer.setBackgroundColor(Color.WHITE);
        composerContainer.setPadding(dp(14), dp(10), dp(14), dp(10));
        main.addView(composerContainer, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        inputView = new EditText(this);
        inputView.setBackground(makeComposerBackground());
        inputView.setHint("메시지를 입력하세요.");
        inputView.setHintTextColor(Color.rgb(126, 140, 154));
        inputView.setTextColor(COLOR_TEXT);
        inputView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        inputView.setTypeface(Typeface.DEFAULT);
        inputView.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        inputView.setMinLines(1);
        inputView.setMaxLines(5);
        inputView.setSingleLine(false);
        inputView.setHorizontallyScrolling(false);
        inputView.setImeOptions(EditorInfo.IME_ACTION_SEND);
        inputView.setGravity(Gravity.TOP | Gravity.START);
        inputView.setPadding(dp(16), dp(12), dp(16), dp(12));
        inputView.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND ||
                    (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN)) {
                handleSend();
                return true;
            }
            return false;
        });
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                1f
        );
        composerContainer.addView(inputView, inputParams);

        sendButton = new ImageButton(this);
        sendButton.setBackground(makeCircleDrawable(COLOR_BRAND));
        sendButton.setColorFilter(Color.WHITE);
        sendButton.setImageResource(R.drawable.ic_send_compose);
        sendButton.setScaleType(ImageView.ScaleType.CENTER);
        sendButton.setPadding(dp(9), dp(9), dp(9), dp(9));
        sendButton.setOnClickListener(v -> handleSend());
        LinearLayout.LayoutParams sendParams = new LinearLayout.LayoutParams(dp(36), dp(36));
        sendParams.leftMargin = dp(8);
        sendParams.gravity = Gravity.CENTER_VERTICAL;
        composerContainer.addView(sendButton, sendParams);

        inputView.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                updateSendButtonState();
            }

            @Override
            public void afterTextChanged(Editable s) {
            }
        });
        updateSendButtonState();

        blockedNoticeView = new TextView(this);
        blockedNoticeView.setVisibility(View.GONE);
        blockedNoticeView.setAlpha(0f);
        blockedNoticeView.setTextColor(Color.WHITE);
        blockedNoticeView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        blockedNoticeView.setTypeface(Typeface.DEFAULT_BOLD);
        blockedNoticeView.setPadding(dp(16), dp(11), dp(16), dp(11));
        blockedNoticeView.setBackground(makeRoundedRectDrawable(Color.argb(235, 47, 52, 46), dp(14), false));
        blockedNoticeView.setGravity(Gravity.CENTER);

        FrameLayout.LayoutParams blockedParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
        );
        blockedParams.leftMargin = dp(28);
        blockedParams.rightMargin = dp(28);
        root.addView(blockedNoticeView, blockedParams);

        sheetBackdrop = new FrameLayout(this);
        sheetBackdrop.setVisibility(View.GONE);
        sheetBackdrop.setAlpha(0f);
        sheetBackdrop.setBackgroundColor(Color.parseColor("#73000000"));
        sheetBackdrop.setOnClickListener(v -> hidePersonaSheet());
        root.addView(sheetBackdrop, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        sheetPanel = new LinearLayout(this);
        sheetPanel.setOrientation(LinearLayout.VERTICAL);
        sheetPanel.setBackground(makeRoundedRectDrawable(Color.WHITE, dp(26), true));
        sheetPanel.setPadding(dp(16), dp(12), dp(16), dp(16));
        sheetPanel.setClickable(true);
        FrameLayout.LayoutParams sheetPanelParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM
        );
        sheetBackdrop.addView(sheetPanel, sheetPanelParams);

        View handle = new View(this);
        handle.setBackground(makeRoundedRectDrawable(Color.rgb(214, 219, 224), dp(2), false));
        LinearLayout.LayoutParams handleParams = new LinearLayout.LayoutParams(dp(48), dp(4));
        handleParams.gravity = Gravity.CENTER_HORIZONTAL;
        sheetPanel.addView(handle, handleParams);

        TextView sheetTitle = new TextView(this);
        sheetTitle.setText("대화 상대 바꾸기");
        sheetTitle.setTextColor(COLOR_TEXT);
        sheetTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        sheetTitle.setTypeface(Typeface.DEFAULT);
        sheetTitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams sheetTitleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        sheetTitleParams.topMargin = dp(16);
        sheetPanel.addView(sheetTitle, sheetTitleParams);

        ScrollView sheetListScroll = new ScrollView(this);
        sheetListScroll.setVerticalScrollBarEnabled(false);
        LinearLayout.LayoutParams sheetListScrollParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        sheetListScrollParams.topMargin = dp(16);
        sheetListScrollParams.height = dp(260);
        sheetPanel.addView(sheetListScroll, sheetListScrollParams);

        sheetList = new LinearLayout(this);
        sheetList.setOrientation(LinearLayout.VERTICAL);
        sheetListScroll.addView(sheetList, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        TextView createMemoryButton = new TextView(this);
        createMemoryButton.setText("새로운 기억 만들기");
        createMemoryButton.setTextColor(Color.rgb(17, 17, 17));
        createMemoryButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        createMemoryButton.setTypeface(Typeface.DEFAULT);
        createMemoryButton.setGravity(Gravity.CENTER);
        createMemoryButton.setPadding(0, dp(14), 0, dp(14));
        createMemoryButton.setBackground(makeBorderedButtonBackground());
        createMemoryButton.setOnClickListener(v -> {
            hidePersonaSheet();
            NativeChatBridge.emitCreateMemory();
        });
        LinearLayout.LayoutParams createParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        createParams.topMargin = dp(16);
        sheetPanel.addView(createMemoryButton, createParams);

        return root;
    }

    private void setupWindowInsets(@NonNull View root) {
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets statusInsets = insets.getInsets(WindowInsetsCompat.Type.statusBars());
            Insets navigationInsets = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
            Insets imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            int imeOffset = Math.max(0, imeInsets.bottom - navigationInsets.bottom);
            int navBottomInset = Math.max(navigationInsets.bottom, dp(6));

            headerContainer.setPadding(
                    dp(12),
                    dp(4) + statusInsets.top,
                    dp(12),
                    dp(8)
            );

            composerContainer.setPadding(
                    dp(14),
                    dp(10),
                    dp(14),
                    dp(10) + navBottomInset
            );
            composerContainer.setTranslationY(-imeOffset);

            messageScrollView.setPadding(
                    messageScrollView.getPaddingLeft(),
                    messageScrollView.getPaddingTop(),
                    messageScrollView.getPaddingRight(),
                    navBottomInset + (imeOffset > 0 ? imeOffset + dp(10) : dp(6))
            );

            if (sheetPanel != null) {
                sheetPanel.setPadding(
                        sheetPanel.getPaddingLeft(),
                        sheetPanel.getPaddingTop(),
                        sheetPanel.getPaddingRight(),
                        dp(16) + Math.max(navigationInsets.bottom, dp(8))
                );
            }

            if (imeVisible || lastImeOffset != imeOffset) {
                scrollToBottom(true);
            }
            lastImeOffset = imeOffset;

            return insets;
        });
    }

    private void applyState(@NonNull NativeChatState state) {
        currentState = state;
        titleView.setText(state.personaName);
        inputView.setHint(state.personaName + "에게 메시지를 보내보세요...");

        if (state.memoryBalance != null) {
            memoryValueView.setText(String.valueOf(state.memoryBalance));
            memoryBadgeView.setVisibility(View.VISIBLE);
        } else {
            memoryBadgeView.setVisibility(View.GONE);
        }

        updateAvatar(state.avatarUrl);
        rebuildMessages(state);
        if (isSheetVisible) {
            refreshPersonaSheet();
        }
    }

    private void rebuildMessages(@NonNull NativeChatState state) {
        messageStack.removeAllViews();

        if (!state.messages.isEmpty()) {
            TextView dateView = new TextView(this);
            dateView.setTextColor(COLOR_TEXT);
            dateView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
            dateView.setTypeface(Typeface.DEFAULT);
            dateView.setText(formatDateLabel(state.messages.get(0).createdAt));
            dateView.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams dateParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
            );
            dateParams.bottomMargin = dp(8);
            messageStack.addView(dateView, dateParams);
        }

        for (NativeChatState.Message message : state.messages) {
            messageStack.addView(makeMessageRow(message));
        }

        if (state.isTyping) {
            messageStack.addView(makeTypingRow());
        }

        scrollToBottom(false);
    }

    private View makeMessageRow(@NonNull NativeChatState.Message message) {
        boolean isUser = "user".equalsIgnoreCase(message.role);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(isUser ? Gravity.END : Gravity.START);
        row.setPadding(0, dp(2), 0, dp(8));

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(isUser ? Gravity.END : Gravity.START);

        TextView bubble = new TextView(this);
        bubble.setText(message.content);
        bubble.setTextColor(isUser ? Color.rgb(44, 58, 70) : COLOR_TEXT);
        bubble.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        bubble.setTypeface(Typeface.DEFAULT, Typeface.NORMAL);
        bubble.setLineSpacing(0f, 1.22f);
        bubble.setPadding(dp(14), dp(12), dp(14), dp(12));
        bubble.setBackground(makeBubbleBackground(isUser));
        bubble.setSingleLine(false);
        bubble.setHorizontallyScrolling(false);
        bubble.setMinWidth(dp(42));
        bubble.setMaxWidth((int) (getResources().getDisplayMetrics().widthPixels * 0.68f));

        TextView timeLabel = new TextView(this);
        timeLabel.setText(formatTime(message.createdAt));
        timeLabel.setTextColor(isUser ? COLOR_SUBTLE_TEXT : COLOR_TEXT);
        timeLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, isUser ? 11 : 10);
        timeLabel.setTypeface(Typeface.DEFAULT, Typeface.NORMAL);

        LinearLayout.LayoutParams timeParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        timeParams.topMargin = dp(6);

        LinearLayout.LayoutParams bubbleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        bubbleParams.gravity = isUser ? Gravity.END : Gravity.START;
        column.addView(bubble, bubbleParams);
        column.addView(timeLabel, timeParams);

        if (isUser) {
            LinearLayout.LayoutParams columnParams = new LinearLayout.LayoutParams(
                    0,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    1f
            );
            row.addView(column, columnParams);
        } else {
            View avatar = makeAvatarView(dp(32), true, currentAvatarBitmap, currentAvatarUrl);
            LinearLayout.LayoutParams avatarParams = new LinearLayout.LayoutParams(dp(32), dp(32));
            avatarParams.topMargin = dp(2);
            row.addView(avatar, avatarParams);

            LinearLayout.LayoutParams columnParams = new LinearLayout.LayoutParams(
                    0,
                    ViewGroup.LayoutParams.WRAP_CONTENT
            );
            columnParams.weight = 1f;
            columnParams.leftMargin = dp(8);
            row.addView(column, columnParams);
        }

        return row;
    }

    private View makeTypingRow() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.START);
        row.setPadding(0, dp(2), 0, dp(8));

        View avatar = makeAvatarView(dp(32), true, currentAvatarBitmap, currentAvatarUrl);
        LinearLayout.LayoutParams avatarParams = new LinearLayout.LayoutParams(dp(32), dp(32));
        avatarParams.topMargin = dp(2);
        row.addView(avatar, avatarParams);

        LinearLayout bubble = new LinearLayout(this);
        bubble.setOrientation(LinearLayout.HORIZONTAL);
        bubble.setGravity(Gravity.CENTER);
        bubble.setPadding(dp(12), dp(10), dp(12), dp(10));
        bubble.setBackground(makeRoundedRectDrawable(COLOR_ASSISTANT_BUBBLE, dp(16), false));

        TypingDotsView dotsView = new TypingDotsView(this);
        bubble.addView(dotsView);

        LinearLayout.LayoutParams bubbleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        bubbleParams.leftMargin = dp(8);
        row.addView(bubble, bubbleParams);

        View spacer = new View(this);
        row.addView(spacer, new LinearLayout.LayoutParams(0, 0, 1f));

        return row;
    }

    private View makeAvatarView(int sizePx, boolean circle, Bitmap bitmap, String avatarUrl) {
        FrameLayout wrapper = new FrameLayout(this);

        ImageView imageView = new ImageView(this);
        imageView.setScaleType(ImageView.ScaleType.CENTER_CROP);
        imageView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.RECTANGLE);
        bg.setColor(COLOR_FALLBACK_BG);
        bg.setCornerRadius(circle ? sizePx / 2f : dp(10));
        imageView.setBackground(bg);
        imageView.setClipToOutline(true);

        if (bitmap != null) {
            imageView.setImageBitmap(bitmap);
        } else {
            imageView.setImageResource(android.R.drawable.ic_menu_myplaces);
            imageView.setColorFilter(COLOR_BRAND);
            loadImageInto(avatarUrl, imageView);
        }

        wrapper.addView(imageView);
        return wrapper;
    }

    private void updateAvatar(String avatarUrl) {
        String normalized = normalizeUrl(avatarUrl);
        if (TextUtils.equals(currentAvatarUrl, normalized)) {
            applyHeaderAvatar();
            return;
        }

        currentAvatarUrl = normalized;
        currentAvatarBitmap = null;
        applyHeaderAvatar();

        if (TextUtils.isEmpty(normalized)) {
            return;
        }

        loadBitmap(normalized, bitmap -> {
            if (!TextUtils.equals(currentAvatarUrl, normalized)) return;
            currentAvatarBitmap = bitmap;
            applyHeaderAvatar();
            if (currentState != null) {
                rebuildMessages(currentState);
            }
        });
    }

    private void applyHeaderAvatar() {
        headerAvatarView.setClipToOutline(true);
        if (currentAvatarBitmap != null) {
            headerAvatarView.setImageBitmap(currentAvatarBitmap);
            headerAvatarView.clearColorFilter();
        } else {
            headerAvatarView.setImageResource(android.R.drawable.ic_menu_myplaces);
            headerAvatarView.setColorFilter(COLOR_BRAND);
        }
    }

    private void loadImageInto(String avatarUrl, ImageView target) {
        String normalized = normalizeUrl(avatarUrl);
        if (TextUtils.isEmpty(normalized) || target == null) return;
        loadBitmap(normalized, bitmap -> {
            if (bitmap == null) return;
            target.setImageBitmap(bitmap);
            target.clearColorFilter();
        });
    }

    private void loadBitmap(String url, BitmapConsumer onResult) {
        imageExecutor.execute(() -> {
            Bitmap bitmap = null;
            HttpURLConnection connection = null;
            try {
                URL parsed = new URL(url);
                connection = (HttpURLConnection) parsed.openConnection();
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(10000);
                connection.setRequestProperty("Cache-Control", "max-age=0");
                connection.connect();
                try (InputStream inputStream = connection.getInputStream()) {
                    bitmap = BitmapFactory.decodeStream(inputStream);
                }
            } catch (Exception ignored) {
                bitmap = null;
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }

            Bitmap finalBitmap = bitmap;
            mainHandler.post(() -> onResult.accept(finalBitmap));
        });
    }

    private void handleSend() {
        if (currentState != null && currentState.isTyping) {
            showBlockedNotice();
            return;
        }

        String text = inputView.getText() == null ? "" : inputView.getText().toString().trim();
        if (text.isEmpty()) return;
        inputView.setText("");
        updateSendButtonState();
        NativeChatBridge.emitSendMessage(text);
    }

    private void updateSendButtonState() {
        if (sendButton == null || inputView == null) return;
        String text = inputView.getText() == null ? "" : inputView.getText().toString().trim();
        boolean canSend = !text.isEmpty();
        sendButton.setEnabled(canSend);
        sendButton.setBackground(makeCircleDrawable(canSend ? COLOR_BRAND : Color.rgb(196, 208, 216)));
        sendButton.setColorFilter(canSend ? Color.WHITE : Color.rgb(120, 141, 154));
        sendButton.setAlpha(canSend ? 1f : 0.85f);
    }

    private void showBlockedNotice() {
        String personaName = currentState == null ? "내 기억" : currentState.personaName;
        blockedNoticeView.setText(personaName + "이 입력중에는 메시지를 보낼 수 없습니다.");
        blockedNoticeView.setVisibility(View.VISIBLE);
        blockedNoticeView.setAlpha(0f);
        blockedNoticeView.animate().cancel();
        blockedNoticeView.animate().alpha(1f).setDuration(170).withEndAction(() ->
                blockedNoticeView.animate().alpha(0f).setStartDelay(1200).setDuration(220).withEndAction(() ->
                        blockedNoticeView.setVisibility(View.GONE)
                ).start()
        ).start();
    }

    private void showPersonaSheet() {
        if (isSheetVisible) return;
        refreshPersonaSheet();
        isSheetVisible = true;
        sheetBackdrop.setVisibility(View.VISIBLE);
        sheetBackdrop.setAlpha(0f);
        sheetBackdrop.animate().alpha(1f).setDuration(180).start();
    }

    private void hidePersonaSheet() {
        if (!isSheetVisible) return;
        isSheetVisible = false;
        sheetBackdrop.animate().alpha(0f).setDuration(180).withEndAction(() -> {
            if (!isSheetVisible) {
                sheetBackdrop.setVisibility(View.GONE);
            }
        }).start();
    }

    private void refreshPersonaSheet() {
        sheetList.removeAllViews();
        if (currentState == null) return;

        Map<String, NativeChatState.Persona> deduped = new LinkedHashMap<>();
        for (NativeChatState.Persona persona : currentState.personas) {
            String id = persona.personaId == null ? "" : persona.personaId.trim();
            if (id.isEmpty() || deduped.containsKey(id)) continue;
            deduped.put(id, persona);
        }

        String currentId = currentState.personaId == null ? "" : currentState.personaId.trim();
        if (!currentId.isEmpty() && !deduped.containsKey(currentId)) {
            deduped.put(currentId, new NativeChatState.Persona(
                    currentId,
                    currentState.personaName,
                    currentState.avatarUrl,
                    "새로운 대화"
            ));
        }

        List<NativeChatState.Persona> personas = new ArrayList<>(deduped.values());
        for (NativeChatState.Persona persona : personas) {
            boolean isActive = currentId.equals(persona.personaId);
            sheetList.addView(makePersonaRow(persona, isActive));
        }
    }

    private View makePersonaRow(NativeChatState.Persona persona, boolean isActive) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(14), dp(12), dp(14), dp(12));
        row.setBackground(makeRoundedRectDrawable(
                isActive ? Color.argb(23, 62, 85, 96) : Color.rgb(248, 251, 253),
                dp(16),
                false
        ));

        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        rowParams.bottomMargin = dp(8);
        row.setLayoutParams(rowParams);

        row.setOnClickListener(v -> {
            hidePersonaSheet();
            NativeChatBridge.emitSelectPersona(persona.personaId);
        });

        View avatar = makeAvatarView(dp(48), false, null, persona.avatarUrl);
        row.addView(avatar, new LinearLayout.LayoutParams(dp(48), dp(48)));

        LinearLayout textCol = new LinearLayout(this);
        textCol.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams textColParams = new LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                1f
        );
        textColParams.leftMargin = dp(12);
        row.addView(textCol, textColParams);

        TextView nameView = new TextView(this);
        nameView.setText(persona.personaName);
        nameView.setTextColor(COLOR_TEXT);
        nameView.setTypeface(Typeface.DEFAULT);
        nameView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        nameView.setSingleLine(true);
        nameView.setEllipsize(TextUtils.TruncateAt.END);
        textCol.addView(nameView);

        TextView lastMessageView = new TextView(this);
        String subtitle = TextUtils.isEmpty(persona.lastMessage) ? "새로운 대화" : persona.lastMessage;
        lastMessageView.setText(subtitle);
        lastMessageView.setTextColor(Color.rgb(93, 96, 90));
        lastMessageView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        lastMessageView.setSingleLine(true);
        lastMessageView.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        subtitleParams.topMargin = dp(3);
        textCol.addView(lastMessageView, subtitleParams);

        if (isActive) {
            View activeDot = new View(this);
            activeDot.setBackground(makeCircleDrawable(COLOR_BRAND));
            row.addView(activeDot, new LinearLayout.LayoutParams(dp(8), dp(8)));
        }

        return row;
    }

    private void scrollToBottom(boolean animated) {
        if (messageScrollView == null) return;
        messageScrollView.post(() -> {
            int target = Math.max(0, messageStack.getHeight() - messageScrollView.getHeight());
            if (animated) {
                messageScrollView.smoothScrollTo(0, target);
            } else {
                messageScrollView.scrollTo(0, target);
            }
        });
    }

    private GradientDrawable makeComposerBackground() {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(Color.rgb(222, 229, 236));
        drawable.setCornerRadius(dp(22));
        return drawable;
    }

    private GradientDrawable makeBorderedButtonBackground() {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(Color.WHITE);
        drawable.setCornerRadius(dp(16));
        drawable.setStroke(dp(2), COLOR_BRAND);
        return drawable;
    }

    private GradientDrawable makeBubbleBackground(boolean isUser) {
        float large = dp(24);
        float small = dp(8);

        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(isUser ? COLOR_USER_BUBBLE : COLOR_ASSISTANT_BUBBLE);

        if (isUser) {
            drawable.setCornerRadii(new float[]{
                    large, large,
                    small, small,
                    large, large,
                    large, large
            });
        } else {
            drawable.setCornerRadii(new float[]{
                    small, small,
                    large, large,
                    large, large,
                    large, large
            });
        }

        return drawable;
    }

    private GradientDrawable makeRoundedRectDrawable(int color, int radiusDp, boolean onlyTopCorners) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        float radius = radiusDp;
        if (onlyTopCorners) {
            drawable.setCornerRadii(new float[]{
                    radius, radius,
                    radius, radius,
                    0, 0,
                    0, 0
            });
        } else {
            drawable.setCornerRadius(radius);
        }
        return drawable;
    }

    private GradientDrawable makeCircleDrawable(int color) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.OVAL);
        drawable.setColor(color);
        return drawable;
    }

    private String normalizeUrl(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) return null;
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return trimmed;
        }
        return null;
    }

    private String formatDateLabel(String iso) {
        Date date = parseIsoDate(iso);
        if (date == null) return "";
        SimpleDateFormat formatter = new SimpleDateFormat("M월 d일 EEEE", Locale.KOREA);
        return formatter.format(date);
    }

    private String formatTime(String iso) {
        Date date = parseIsoDate(iso);
        if (date == null) return "";
        SimpleDateFormat formatter = new SimpleDateFormat("a h:mm", Locale.KOREA);
        return formatter.format(date);
    }

    private Date parseIsoDate(String iso) {
        if (iso == null || iso.trim().isEmpty()) return null;

        String[] patterns = new String[]{
                "yyyy-MM-dd'T'HH:mm:ss.SSSX",
                "yyyy-MM-dd'T'HH:mm:ssX",
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                "yyyy-MM-dd'T'HH:mm:ss'Z'"
        };

        for (String pattern : patterns) {
            try {
                SimpleDateFormat parser = new SimpleDateFormat(pattern, Locale.US);
                parser.setTimeZone(TimeZone.getTimeZone("UTC"));
                return parser.parse(iso);
            } catch (ParseException ignored) {
            }
        }

        return null;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                value,
                getResources().getDisplayMetrics()
        ));
    }

    private interface BitmapConsumer {
        void accept(Bitmap bitmap);
    }
}
