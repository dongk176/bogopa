import UIKit
import Capacitor
import AuthenticationServices
import StoreKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var didRegisterNativeChatPlugin = false
    private var didRegisterNativeAppleAuthPlugin = false
    private var didRegisterNativeIapPlugin = false
    private var transactionUpdatesTask: Task<Void, Never>?

    private var bogopaBackgroundColor: UIColor {
        UIColor.white
    }

    private func applyBogopaNativeAppearance() {
        guard let window = self.window else { return }

        window.backgroundColor = bogopaBackgroundColor
        window.overrideUserInterfaceStyle = .light

        if let bridgeVC = window.rootViewController as? CAPBridgeViewController {
            bridgeVC.view.backgroundColor = bogopaBackgroundColor
            bridgeVC.webView?.isOpaque = false
            bridgeVC.webView?.backgroundColor = bogopaBackgroundColor
            bridgeVC.webView?.allowsLinkPreview = false
            bridgeVC.webView?.scrollView.backgroundColor = bogopaBackgroundColor
            bridgeVC.webView?.scrollView.showsVerticalScrollIndicator = false
            bridgeVC.webView?.scrollView.showsHorizontalScrollIndicator = false
        }
    }

    private func findBridgeViewController(from viewController: UIViewController?) -> CAPBridgeViewController? {
        guard let viewController else { return nil }
        if let bridge = viewController as? CAPBridgeViewController {
            return bridge
        }
        if let navigationController = viewController as? UINavigationController {
            if let found = findBridgeViewController(from: navigationController.visibleViewController) {
                return found
            }
        }
        if let tabBarController = viewController as? UITabBarController {
            if let found = findBridgeViewController(from: tabBarController.selectedViewController) {
                return found
            }
        }
        for child in viewController.children {
            if let found = findBridgeViewController(from: child) {
                return found
            }
        }
        return findBridgeViewController(from: viewController.presentedViewController)
    }

    private func registerNativeChatPluginIfNeeded(attempt: Int = 0) {
        if didRegisterNativeChatPlugin && didRegisterNativeAppleAuthPlugin && didRegisterNativeIapPlugin { return }
        guard let window else { return }
        guard let bridgeViewController = findBridgeViewController(from: window.rootViewController),
              let bridge = bridgeViewController.bridge else {
            if attempt < 25 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
                    self?.registerNativeChatPluginIfNeeded(attempt: attempt + 1)
                }
            }
            return
        }

        if !didRegisterNativeChatPlugin {
            bridge.registerPluginInstance(NativeChatPlugin())
            didRegisterNativeChatPlugin = true
        }
        if !didRegisterNativeAppleAuthPlugin {
            bridge.registerPluginInstance(NativeAppleAuthPlugin())
            didRegisterNativeAppleAuthPlugin = true
        }
        if !didRegisterNativeIapPlugin {
            bridge.registerPluginInstance(NativeIapPlugin())
            didRegisterNativeIapPlugin = true
        }
    }


    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if #available(iOS 15.0, *) {
            transactionUpdatesTask = Task {
                for await verification in Transaction.updates {
                    if case .verified(let transaction) = verification {
                        await transaction.finish()
                    }
                }
            }
        }
        
        DispatchQueue.main.async { [weak self] in
            self?.applyBogopaNativeAppearance()
            self?.registerNativeChatPluginIfNeeded()
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        applyBogopaNativeAppearance()
        registerNativeChatPluginIfNeeded()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

private struct NativeChatMessageItem {
    let id: String
    let role: String
    let content: String
    let createdAt: String

    init?(dictionary: [String: Any]) {
        guard
            let id = dictionary["id"] as? String,
            let role = dictionary["role"] as? String,
            let content = dictionary["content"] as? String,
            let createdAt = dictionary["createdAt"] as? String
        else {
            return nil
        }

        self.id = id
        self.role = role
        self.content = content
        self.createdAt = createdAt
    }
}

private struct NativeChatState {
    let personaId: String
    let personaName: String
    let avatarUrl: String?
    let messages: [NativeChatMessageItem]
    let isTyping: Bool
    let memoryBalance: Int?
    let personas: [NativeChatPersonaItem]
}

private struct NativeChatPersonaItem {
    let personaId: String
    let personaName: String
    let avatarUrl: String?
    let lastMessage: String
    let isLocked: Bool

    init(personaId: String, personaName: String, avatarUrl: String?, lastMessage: String, isLocked: Bool) {
        self.personaId = personaId
        self.personaName = personaName
        self.avatarUrl = avatarUrl
        self.lastMessage = lastMessage
        self.isLocked = isLocked
    }

    init?(dictionary: [String: Any]) {
        guard
            let personaId = dictionary["personaId"] as? String,
            let personaName = dictionary["personaName"] as? String
        else {
            return nil
        }

        self.personaId = personaId
        self.personaName = personaName
        self.avatarUrl = dictionary["avatarUrl"] as? String
        self.lastMessage = (dictionary["lastMessage"] as? String) ?? ""
        self.isLocked = (dictionary["isLocked"] as? Bool) ?? false
    }
}

private final class MemoryMarkIconView: UIView {
    var strokeColor: UIColor = UIColor(red: 62 / 255, green: 85 / 255, blue: 96 / 255, alpha: 1) {
        didSet { setNeedsDisplay() }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        contentMode = .redraw
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        backgroundColor = .clear
        isOpaque = false
        contentMode = .redraw
    }

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }

        let lineWidth: CGFloat = 1.7
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let radius = max(min(rect.width, rect.height) * 0.5 - lineWidth, 0)

        ctx.setStrokeColor(strokeColor.cgColor)
        ctx.setLineWidth(lineWidth)
        ctx.strokeEllipse(in: CGRect(
            x: center.x - radius,
            y: center.y - radius,
            width: radius * 2,
            height: radius * 2
        ))

        ctx.setLineCap(.round)
        ctx.beginPath()
        ctx.move(to: CGPoint(x: center.x, y: center.y - radius * 0.45))
        ctx.addLine(to: CGPoint(x: center.x, y: center.y + radius * 0.12))
        ctx.addLine(to: CGPoint(x: center.x + radius * 0.34, y: center.y + radius * 0.34))
        ctx.strokePath()

        let dotRadius = max(radius * 0.12, 1.1)
        ctx.setFillColor(strokeColor.cgColor)
        ctx.fillEllipse(in: CGRect(
            x: center.x - dotRadius,
            y: center.y - dotRadius,
            width: dotRadius * 2,
            height: dotRadius * 2
        ))
    }
}

private final class NativeChatSlideAnimator: NSObject, UIViewControllerAnimatedTransitioning {
    private let isPresenting: Bool

    init(isPresenting: Bool) {
        self.isPresenting = isPresenting
        super.init()
    }

    func transitionDuration(using transitionContext: UIViewControllerContextTransitioning?) -> TimeInterval {
        return isPresenting ? 0.28 : 0.24
    }

    func animateTransition(using transitionContext: UIViewControllerContextTransitioning) {
        let container = transitionContext.containerView
        let duration = transitionDuration(using: transitionContext)

        if isPresenting {
            guard let toView = transitionContext.view(forKey: .to) else {
                transitionContext.completeTransition(false)
                return
            }

            toView.frame = transitionContext.finalFrame(for: transitionContext.viewController(forKey: .to)!)
            toView.transform = CGAffineTransform(translationX: container.bounds.width, y: 0)
            container.addSubview(toView)

            UIView.animate(
                withDuration: duration,
                delay: 0,
                usingSpringWithDamping: 1.0,
                initialSpringVelocity: 0.3,
                options: [.curveEaseOut, .allowUserInteraction]
            ) {
                toView.transform = .identity
            } completion: { finished in
                transitionContext.completeTransition(finished)
            }
            return
        }

        guard let fromView = transitionContext.view(forKey: .from) else {
            transitionContext.completeTransition(false)
            return
        }
        if let toView = transitionContext.view(forKey: .to) {
            container.insertSubview(toView, belowSubview: fromView)
        }

        UIView.animate(
            withDuration: duration,
            delay: 0,
            options: [.curveEaseInOut, .allowUserInteraction]
        ) {
            fromView.transform = CGAffineTransform(translationX: container.bounds.width, y: 0)
        } completion: { finished in
            fromView.transform = .identity
            transitionContext.completeTransition(finished)
        }
    }
}

private final class NativeChatTransitioningDelegate: NSObject, UIViewControllerTransitioningDelegate {
    static let shared = NativeChatTransitioningDelegate()

    func animationController(
        forPresented presented: UIViewController,
        presenting: UIViewController,
        source: UIViewController
    ) -> UIViewControllerAnimatedTransitioning? {
        NativeChatSlideAnimator(isPresenting: true)
    }

    func animationController(forDismissed dismissed: UIViewController) -> UIViewControllerAnimatedTransitioning? {
        NativeChatSlideAnimator(isPresenting: false)
    }
}

private final class TypingDotsView: UIView {
    private let stackView = UIStackView()
    private var dotViews: [UIView] = []
    private var timer: Timer?
    private var activeIndex = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
        start()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
        start()
    }

    deinit {
        timer?.invalidate()
    }

    private func setup() {
        translatesAutoresizingMaskIntoConstraints = false
        stackView.translatesAutoresizingMaskIntoConstraints = false
        stackView.axis = .horizontal
        stackView.alignment = .center
        stackView.spacing = 6
        addSubview(stackView)

        for _ in 0..<3 {
            let dot = UIView()
            dot.translatesAutoresizingMaskIntoConstraints = false
            dot.backgroundColor = UIColor(red: 106 / 255, green: 116 / 255, blue: 128 / 255, alpha: 1)
            dot.layer.cornerRadius = 3
            dot.alpha = 0.35
            dot.transform = .identity
            NSLayoutConstraint.activate([
                dot.widthAnchor.constraint(equalToConstant: 6),
                dot.heightAnchor.constraint(equalToConstant: 6),
            ])
            stackView.addArrangedSubview(dot)
            dotViews.append(dot)
        }

        NSLayoutConstraint.activate([
            stackView.topAnchor.constraint(equalTo: topAnchor),
            stackView.leadingAnchor.constraint(equalTo: leadingAnchor),
            stackView.trailingAnchor.constraint(equalTo: trailingAnchor),
            stackView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])

        updateDots(animated: false)
    }

    private func start() {
        timer?.invalidate()
        activeIndex = 0
        updateDots(animated: false)

        let timer = Timer(timeInterval: 0.24, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.activeIndex = (self.activeIndex + 1) % 3
            self.updateDots(animated: true)
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    private func updateDots(animated: Bool) {
        for (index, dot) in dotViews.enumerated() {
            let isActive = index == activeIndex
            let updates = {
                dot.alpha = isActive ? 1.0 : 0.35
                dot.transform = isActive ? CGAffineTransform(translationX: 0, y: -2.2).scaledBy(x: 1.18, y: 1.18) : .identity
            }
            if animated {
                UIView.animate(
                    withDuration: 0.22,
                    delay: 0,
                    usingSpringWithDamping: 0.72,
                    initialSpringVelocity: 0.35,
                    options: [.allowUserInteraction, .curveEaseInOut],
                    animations: updates
                )
            } else {
                updates()
            }
        }
    }
}

private final class NativeChatViewController: UIViewController, UITextFieldDelegate {
    private enum AvatarStyle {
        case circle
        case roundedRect
    }

    var onSendMessage: ((String) -> Void)?
    var onClose: (() -> Void)?
    var onSelectPersona: ((String) -> Void)?
    var onSubscribeMemoryPass: ((String, String) -> Void)?
    var onCreateMemory: (() -> Void)?

    private let brandColor = UIColor(red: 62 / 255, green: 85 / 255, blue: 96 / 255, alpha: 1)
    private let textColor = UIColor(red: 58 / 255, green: 66 / 255, blue: 74 / 255, alpha: 1)
    private let subtleTextColor = UIColor(red: 100 / 255, green: 116 / 255, blue: 139 / 255, alpha: 1)
    private let userBubbleColor = UIColor(red: 205 / 255, green: 230 / 255, blue: 244 / 255, alpha: 1)
    private let assistantBubbleColor = UIColor(red: 227 / 255, green: 232 / 255, blue: 235 / 255, alpha: 1)
    private let pageBackgroundColor = UIColor.white

    private let headerView = UIView()
    private let headerContentView = UIView()
    private let headerAvatarContainer = UIView()
    private let headerAvatarImageView = UIImageView()
    private let headerAvatarFallbackView = UIView()
    private let headerAvatarFallbackIcon = UIImageView()
    private let titleLabel = UILabel()
    private let chevronImageView = UIImageView()
    private let personaTapButton = UIButton(type: .custom)
    private let memoryBadgeView = UIView()
    private let memoryIconView = MemoryMarkIconView()
    private let memoryLabel = UILabel()
    private let backButton = UIButton(type: .system)

    private let scrollView = UIScrollView()
    private let stackView = UIStackView()

    private let composerView = UIView()
    private let textField = UITextField()
    private let sendButton = UIButton(type: .system)
    private let blockedNoticeLabel = UILabel()

    private let sheetBackdropView = UIControl()
    private let sheetContainerView = UIView()
    private let sheetTitleLabel = UILabel()
    private let sheetListScrollView = UIScrollView()
    private let sheetListStackView = UIStackView()
    private let sheetCreateButton = UIButton(type: .system)
    private var isSheetVisible = false
    private lazy var backSwipeGesture: UIScreenEdgePanGestureRecognizer = {
        let gesture = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleBackSwipe(_:)))
        gesture.edges = .left
        return gesture
    }()
    private lazy var rightSwipeBackGesture: UISwipeGestureRecognizer = {
        let gesture = UISwipeGestureRecognizer(target: self, action: #selector(handleRightSwipeBack))
        gesture.direction = .right
        gesture.numberOfTouchesRequired = 1
        return gesture
    }()

    private var currentState: NativeChatState?
    private var currentAvatarURL: String?
    private var currentAvatarImage: UIImage?
    private var avatarTask: URLSessionDataTask?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = pageBackgroundColor
        setupLayout()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleKeyboardWillChangeFrame(_:)),
            name: UIResponder.keyboardWillChangeFrameNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        avatarTask?.cancel()
    }

    private func setupLayout() {
        headerView.translatesAutoresizingMaskIntoConstraints = false
        headerView.backgroundColor = .white
        view.addSubview(headerView)

        headerContentView.translatesAutoresizingMaskIntoConstraints = false
        headerView.addSubview(headerContentView)

        backButton.translatesAutoresizingMaskIntoConstraints = false
        backButton.setImage(UIImage(systemName: "chevron.left"), for: .normal)
        backButton.tintColor = brandColor
        backButton.addTarget(self, action: #selector(handleBack), for: .touchUpInside)
        backButton.backgroundColor = .clear
        headerContentView.addSubview(backButton)

        headerAvatarContainer.translatesAutoresizingMaskIntoConstraints = false
        headerAvatarContainer.backgroundColor = UIColor(white: 0, alpha: 0.05)
        headerAvatarContainer.layer.cornerRadius = 10
        headerAvatarContainer.layer.masksToBounds = true
        headerContentView.addSubview(headerAvatarContainer)

        headerAvatarImageView.translatesAutoresizingMaskIntoConstraints = false
        headerAvatarImageView.contentMode = .scaleAspectFill
        headerAvatarImageView.clipsToBounds = true
        headerAvatarImageView.isHidden = true
        headerAvatarContainer.addSubview(headerAvatarImageView)

        headerAvatarFallbackView.translatesAutoresizingMaskIntoConstraints = false
        headerAvatarFallbackView.backgroundColor = UIColor(red: 230 / 255, green: 233 / 255, blue: 226 / 255, alpha: 1)
        headerAvatarFallbackView.layer.cornerRadius = 10
        headerAvatarFallbackView.layer.masksToBounds = true
        headerAvatarContainer.addSubview(headerAvatarFallbackView)

        headerAvatarFallbackIcon.translatesAutoresizingMaskIntoConstraints = false
        headerAvatarFallbackIcon.image = UIImage(systemName: "person.crop.circle")
        headerAvatarFallbackIcon.tintColor = brandColor
        headerAvatarFallbackView.addSubview(headerAvatarFallbackIcon)

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.font = UIFont.systemFont(ofSize: 16, weight: .bold)
        titleLabel.textColor = textColor
        titleLabel.numberOfLines = 1
        headerContentView.addSubview(titleLabel)

        chevronImageView.translatesAutoresizingMaskIntoConstraints = false
        chevronImageView.image = UIImage(
            systemName: "chevron.down",
            withConfiguration: UIImage.SymbolConfiguration(pointSize: 12, weight: .bold)
        )
        chevronImageView.tintColor = brandColor
        chevronImageView.contentMode = .scaleAspectFit
        headerContentView.addSubview(chevronImageView)

        personaTapButton.translatesAutoresizingMaskIntoConstraints = false
        personaTapButton.backgroundColor = .clear
        personaTapButton.addTarget(self, action: #selector(handlePersonaTap), for: .touchUpInside)
        headerContentView.addSubview(personaTapButton)

        memoryBadgeView.translatesAutoresizingMaskIntoConstraints = false
        memoryBadgeView.backgroundColor = UIColor(red: 244 / 255, green: 248 / 255, blue: 250 / 255, alpha: 1)
        memoryBadgeView.layer.cornerRadius = 13
        memoryBadgeView.layer.masksToBounds = true
        headerContentView.addSubview(memoryBadgeView)

        memoryIconView.translatesAutoresizingMaskIntoConstraints = false
        memoryIconView.strokeColor = brandColor
        memoryBadgeView.addSubview(memoryIconView)

        memoryLabel.translatesAutoresizingMaskIntoConstraints = false
        memoryLabel.font = UIFont.systemFont(ofSize: 14, weight: .regular)
        memoryLabel.textColor = brandColor
        memoryLabel.textAlignment = .right
        memoryBadgeView.addSubview(memoryLabel)

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.alwaysBounceVertical = true
        scrollView.keyboardDismissMode = .interactive
        scrollView.showsVerticalScrollIndicator = false
        scrollView.backgroundColor = pageBackgroundColor
        view.addSubview(scrollView)

        stackView.translatesAutoresizingMaskIntoConstraints = false
        stackView.axis = .vertical
        stackView.spacing = 14
        scrollView.addSubview(stackView)

        composerView.translatesAutoresizingMaskIntoConstraints = false
        composerView.backgroundColor = .white
        view.addSubview(composerView)

        textField.translatesAutoresizingMaskIntoConstraints = false
        textField.backgroundColor = UIColor(red: 222 / 255, green: 229 / 255, blue: 236 / 255, alpha: 1)
        textField.layer.cornerRadius = 22
        textField.layer.masksToBounds = true
        textField.attributedPlaceholder = NSAttributedString(
            string: "메시지를 입력하세요.",
            attributes: [
                .foregroundColor: UIColor(red: 126 / 255, green: 140 / 255, blue: 154 / 255, alpha: 1),
            ]
        )
        textField.returnKeyType = .send
        textField.delegate = self
        textField.font = UIFont.systemFont(ofSize: 16, weight: .regular)
        textField.textColor = textColor
        textField.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 14, height: 44))
        textField.leftViewMode = .always
        textField.rightView = UIView(frame: CGRect(x: 0, y: 0, width: 50, height: 44))
        textField.rightViewMode = .always
        composerView.addSubview(textField)

        sendButton.translatesAutoresizingMaskIntoConstraints = false
        sendButton.tintColor = .white
        sendButton.backgroundColor = brandColor
        sendButton.layer.cornerRadius = 18
        sendButton.setImage(UIImage(systemName: "paperplane.fill"), for: .normal)
        sendButton.addTarget(self, action: #selector(handleSend), for: .touchUpInside)
        composerView.addSubview(sendButton)

        blockedNoticeLabel.translatesAutoresizingMaskIntoConstraints = false
        blockedNoticeLabel.backgroundColor = UIColor(red: 47 / 255, green: 52 / 255, blue: 46 / 255, alpha: 0.92)
        blockedNoticeLabel.textColor = .white
        blockedNoticeLabel.font = UIFont.systemFont(ofSize: 14, weight: .semibold)
        blockedNoticeLabel.textAlignment = .center
        blockedNoticeLabel.numberOfLines = 2
        blockedNoticeLabel.layer.cornerRadius = 14
        blockedNoticeLabel.layer.masksToBounds = true
        blockedNoticeLabel.alpha = 0
        blockedNoticeLabel.isHidden = true
        blockedNoticeLabel.setContentCompressionResistancePriority(.required, for: .vertical)
        blockedNoticeLabel.setContentHuggingPriority(.required, for: .vertical)
        view.addSubview(blockedNoticeLabel)

        let keyboardGuide = view.keyboardLayoutGuide
        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: view.topAnchor),
            headerView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            headerView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            headerContentView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            headerContentView.leadingAnchor.constraint(equalTo: headerView.leadingAnchor),
            headerContentView.trailingAnchor.constraint(equalTo: headerView.trailingAnchor),
            headerContentView.heightAnchor.constraint(equalToConstant: 64),
            headerContentView.bottomAnchor.constraint(equalTo: headerView.bottomAnchor),

            backButton.leadingAnchor.constraint(equalTo: headerContentView.leadingAnchor, constant: 12),
            backButton.centerYAnchor.constraint(equalTo: headerContentView.centerYAnchor),
            backButton.widthAnchor.constraint(equalToConstant: 36),
            backButton.heightAnchor.constraint(equalToConstant: 36),

            headerAvatarContainer.leadingAnchor.constraint(equalTo: backButton.trailingAnchor, constant: 8),
            headerAvatarContainer.centerYAnchor.constraint(equalTo: headerContentView.centerYAnchor),
            headerAvatarContainer.widthAnchor.constraint(equalToConstant: 36),
            headerAvatarContainer.heightAnchor.constraint(equalToConstant: 36),

            headerAvatarImageView.topAnchor.constraint(equalTo: headerAvatarContainer.topAnchor),
            headerAvatarImageView.leadingAnchor.constraint(equalTo: headerAvatarContainer.leadingAnchor),
            headerAvatarImageView.trailingAnchor.constraint(equalTo: headerAvatarContainer.trailingAnchor),
            headerAvatarImageView.bottomAnchor.constraint(equalTo: headerAvatarContainer.bottomAnchor),

            headerAvatarFallbackView.topAnchor.constraint(equalTo: headerAvatarContainer.topAnchor),
            headerAvatarFallbackView.leadingAnchor.constraint(equalTo: headerAvatarContainer.leadingAnchor),
            headerAvatarFallbackView.trailingAnchor.constraint(equalTo: headerAvatarContainer.trailingAnchor),
            headerAvatarFallbackView.bottomAnchor.constraint(equalTo: headerAvatarContainer.bottomAnchor),

            headerAvatarFallbackIcon.centerXAnchor.constraint(equalTo: headerAvatarFallbackView.centerXAnchor),
            headerAvatarFallbackIcon.centerYAnchor.constraint(equalTo: headerAvatarFallbackView.centerYAnchor),
            headerAvatarFallbackIcon.widthAnchor.constraint(equalToConstant: 20),
            headerAvatarFallbackIcon.heightAnchor.constraint(equalToConstant: 20),

            titleLabel.leadingAnchor.constraint(equalTo: headerAvatarContainer.trailingAnchor, constant: 10),
            titleLabel.centerYAnchor.constraint(equalTo: headerContentView.centerYAnchor),

            chevronImageView.leadingAnchor.constraint(equalTo: titleLabel.trailingAnchor, constant: 6),
            chevronImageView.centerYAnchor.constraint(equalTo: headerContentView.centerYAnchor),
            chevronImageView.widthAnchor.constraint(equalToConstant: 12),
            chevronImageView.heightAnchor.constraint(equalToConstant: 12),

            personaTapButton.leadingAnchor.constraint(equalTo: headerAvatarContainer.leadingAnchor, constant: -2),
            personaTapButton.trailingAnchor.constraint(equalTo: chevronImageView.trailingAnchor, constant: 6),
            personaTapButton.topAnchor.constraint(equalTo: headerContentView.topAnchor, constant: 8),
            personaTapButton.bottomAnchor.constraint(equalTo: headerContentView.bottomAnchor, constant: -8),

            memoryBadgeView.leadingAnchor.constraint(greaterThanOrEqualTo: chevronImageView.trailingAnchor, constant: 8),
            memoryBadgeView.trailingAnchor.constraint(equalTo: headerContentView.trailingAnchor, constant: -12),
            memoryBadgeView.centerYAnchor.constraint(equalTo: headerContentView.centerYAnchor),
            memoryBadgeView.heightAnchor.constraint(equalToConstant: 40),
            memoryBadgeView.widthAnchor.constraint(greaterThanOrEqualToConstant: 66),

            memoryIconView.leadingAnchor.constraint(equalTo: memoryBadgeView.leadingAnchor, constant: 12),
            memoryIconView.centerYAnchor.constraint(equalTo: memoryBadgeView.centerYAnchor),
            memoryIconView.widthAnchor.constraint(equalToConstant: 20),
            memoryIconView.heightAnchor.constraint(equalToConstant: 20),

            memoryLabel.leadingAnchor.constraint(equalTo: memoryIconView.trailingAnchor, constant: 7),
            memoryLabel.trailingAnchor.constraint(equalTo: memoryBadgeView.trailingAnchor, constant: -12),
            memoryLabel.centerYAnchor.constraint(equalTo: memoryBadgeView.centerYAnchor),

            composerView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            composerView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            composerView.bottomAnchor.constraint(equalTo: keyboardGuide.topAnchor),

            textField.leadingAnchor.constraint(equalTo: composerView.leadingAnchor, constant: 14),
            textField.topAnchor.constraint(equalTo: composerView.topAnchor, constant: 10),
            textField.bottomAnchor.constraint(equalTo: composerView.safeAreaLayoutGuide.bottomAnchor, constant: -10),
            textField.trailingAnchor.constraint(equalTo: composerView.trailingAnchor, constant: -14),
            textField.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),

            sendButton.trailingAnchor.constraint(equalTo: textField.trailingAnchor, constant: -8),
            sendButton.centerYAnchor.constraint(equalTo: textField.centerYAnchor),
            sendButton.widthAnchor.constraint(equalToConstant: 36),
            sendButton.heightAnchor.constraint(equalToConstant: 36),

            blockedNoticeLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            blockedNoticeLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            blockedNoticeLabel.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 28),
            blockedNoticeLabel.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -28),

            scrollView.topAnchor.constraint(equalTo: headerView.bottomAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: composerView.topAnchor),

            stackView.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 16),
            stackView.leadingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.leadingAnchor, constant: 12),
            stackView.trailingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.trailingAnchor, constant: -12),
            stackView.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -18)
        ])

        let headerTap = UITapGestureRecognizer(target: self, action: #selector(handleGlobalTapToDismissKeyboard))
        headerTap.cancelsTouchesInView = false
        headerView.addGestureRecognizer(headerTap)

        let scrollTap = UITapGestureRecognizer(target: self, action: #selector(handleGlobalTapToDismissKeyboard))
        scrollTap.cancelsTouchesInView = false
        scrollView.addGestureRecognizer(scrollTap)
        view.addGestureRecognizer(backSwipeGesture)
        view.addGestureRecognizer(rightSwipeBackGesture)

        setupPersonaSheetLayout()
    }

    private func setupPersonaSheetLayout() {
        sheetBackdropView.translatesAutoresizingMaskIntoConstraints = false
        sheetBackdropView.backgroundColor = UIColor(white: 0, alpha: 0)
        sheetBackdropView.alpha = 0
        sheetBackdropView.isHidden = true
        sheetBackdropView.addTarget(self, action: #selector(hidePersonaSheet), for: .touchUpInside)
        view.addSubview(sheetBackdropView)

        sheetContainerView.translatesAutoresizingMaskIntoConstraints = false
        sheetContainerView.backgroundColor = .white
        sheetContainerView.layer.cornerRadius = 26
        sheetContainerView.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
        sheetContainerView.clipsToBounds = true
        sheetBackdropView.addSubview(sheetContainerView)

        let handle = UIView()
        handle.translatesAutoresizingMaskIntoConstraints = false
        handle.backgroundColor = UIColor(red: 214 / 255, green: 219 / 255, blue: 224 / 255, alpha: 1)
        handle.layer.cornerRadius = 2
        sheetContainerView.addSubview(handle)

        sheetTitleLabel.translatesAutoresizingMaskIntoConstraints = false
        sheetTitleLabel.text = "대화 상대 바꾸기"
        sheetTitleLabel.font = UIFont.systemFont(ofSize: 20, weight: .bold)
        sheetTitleLabel.textAlignment = .center
        sheetTitleLabel.textColor = textColor
        sheetContainerView.addSubview(sheetTitleLabel)

        sheetListScrollView.translatesAutoresizingMaskIntoConstraints = false
        sheetListScrollView.showsVerticalScrollIndicator = false
        sheetContainerView.addSubview(sheetListScrollView)

        sheetListStackView.translatesAutoresizingMaskIntoConstraints = false
        sheetListStackView.axis = .vertical
        sheetListStackView.spacing = 8
        sheetListScrollView.addSubview(sheetListStackView)

        sheetCreateButton.translatesAutoresizingMaskIntoConstraints = false
        sheetCreateButton.setTitle("새로운 기억 만들기", for: .normal)
        sheetCreateButton.setTitleColor(UIColor(red: 17 / 255, green: 17 / 255, blue: 17 / 255, alpha: 1), for: .normal)
        sheetCreateButton.titleLabel?.font = UIFont.systemFont(ofSize: 14, weight: .bold)
        sheetCreateButton.backgroundColor = .white
        sheetCreateButton.layer.cornerRadius = 16
        sheetCreateButton.layer.borderWidth = 2
        sheetCreateButton.layer.borderColor = brandColor.cgColor
        sheetCreateButton.addTarget(self, action: #selector(handleCreateMemory), for: .touchUpInside)
        sheetContainerView.addSubview(sheetCreateButton)

        NSLayoutConstraint.activate([
            sheetBackdropView.topAnchor.constraint(equalTo: view.topAnchor),
            sheetBackdropView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            sheetBackdropView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            sheetBackdropView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            sheetContainerView.leadingAnchor.constraint(equalTo: sheetBackdropView.leadingAnchor),
            sheetContainerView.trailingAnchor.constraint(equalTo: sheetBackdropView.trailingAnchor),
            sheetContainerView.bottomAnchor.constraint(equalTo: sheetBackdropView.bottomAnchor),
            sheetContainerView.heightAnchor.constraint(greaterThanOrEqualToConstant: 360),
            sheetContainerView.heightAnchor.constraint(lessThanOrEqualTo: view.heightAnchor, multiplier: 0.75),

            handle.topAnchor.constraint(equalTo: sheetContainerView.topAnchor, constant: 12),
            handle.centerXAnchor.constraint(equalTo: sheetContainerView.centerXAnchor),
            handle.widthAnchor.constraint(equalToConstant: 48),
            handle.heightAnchor.constraint(equalToConstant: 4),

            sheetTitleLabel.topAnchor.constraint(equalTo: handle.bottomAnchor, constant: 16),
            sheetTitleLabel.leadingAnchor.constraint(equalTo: sheetContainerView.leadingAnchor, constant: 24),
            sheetTitleLabel.trailingAnchor.constraint(equalTo: sheetContainerView.trailingAnchor, constant: -24),

            sheetListScrollView.topAnchor.constraint(equalTo: sheetTitleLabel.bottomAnchor, constant: 16),
            sheetListScrollView.leadingAnchor.constraint(equalTo: sheetContainerView.leadingAnchor, constant: 16),
            sheetListScrollView.trailingAnchor.constraint(equalTo: sheetContainerView.trailingAnchor, constant: -16),
            sheetListScrollView.heightAnchor.constraint(greaterThanOrEqualToConstant: 140),

            sheetListStackView.topAnchor.constraint(equalTo: sheetListScrollView.contentLayoutGuide.topAnchor),
            sheetListStackView.leadingAnchor.constraint(equalTo: sheetListScrollView.frameLayoutGuide.leadingAnchor),
            sheetListStackView.trailingAnchor.constraint(equalTo: sheetListScrollView.frameLayoutGuide.trailingAnchor),
            sheetListStackView.bottomAnchor.constraint(equalTo: sheetListScrollView.contentLayoutGuide.bottomAnchor),

            sheetCreateButton.topAnchor.constraint(equalTo: sheetListScrollView.bottomAnchor, constant: 16),
            sheetCreateButton.leadingAnchor.constraint(equalTo: sheetContainerView.leadingAnchor, constant: 20),
            sheetCreateButton.trailingAnchor.constraint(equalTo: sheetContainerView.trailingAnchor, constant: -20),
            sheetCreateButton.heightAnchor.constraint(equalToConstant: 52),
            sheetCreateButton.bottomAnchor.constraint(equalTo: sheetContainerView.safeAreaLayoutGuide.bottomAnchor, constant: -16)
        ])
    }

    @objc private func handlePersonaTap() {
        guard currentState != nil else { return }
        view.endEditing(true)
        refreshPersonaSheet()
        showPersonaSheet()
    }

    private func showPersonaSheet() {
        guard !isSheetVisible else { return }
        isSheetVisible = true
        sheetBackdropView.isHidden = false
        sheetBackdropView.alpha = 0
        view.endEditing(true)
        UIView.animate(withDuration: 0.2) {
            self.sheetBackdropView.alpha = 1
            self.sheetBackdropView.backgroundColor = UIColor(white: 0, alpha: 0.45)
        }
    }

    @objc private func hidePersonaSheet() {
        guard isSheetVisible else { return }
        isSheetVisible = false
        UIView.animate(withDuration: 0.2, animations: {
            self.sheetBackdropView.alpha = 0
            self.sheetBackdropView.backgroundColor = UIColor(white: 0, alpha: 0)
        }, completion: { _ in
            self.sheetBackdropView.isHidden = true
        })
    }

    private func refreshPersonaSheet() {
        sheetListStackView.arrangedSubviews.forEach { sub in
            sheetListStackView.removeArrangedSubview(sub)
            sub.removeFromSuperview()
        }

        guard let state = currentState else { return }

        var personas: [NativeChatPersonaItem] = []
        var seenIds = Set<String>()
        for persona in state.personas {
            let id = persona.personaId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !id.isEmpty, !seenIds.contains(id) else { continue }
            seenIds.insert(id)
            personas.append(persona)
        }

        let trimmedCurrentId = state.personaId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedCurrentId.isEmpty && !seenIds.contains(trimmedCurrentId) {
            personas.insert(
                NativeChatPersonaItem(
                    personaId: trimmedCurrentId,
                    personaName: state.personaName,
                    avatarUrl: state.avatarUrl,
                    lastMessage: "새로운 대화",
                    isLocked: false
                ),
                at: 0
            )
        }

        for persona in personas {
            let button = makePersonaRow(persona: persona, isActive: persona.personaId == state.personaId)
            sheetListStackView.addArrangedSubview(button)
        }
    }

    private func makePersonaRow(persona: NativeChatPersonaItem, isActive: Bool) -> UIView {
        let button = UIButton(type: .custom)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.backgroundColor = isActive
            ? UIColor(red: 62 / 255, green: 85 / 255, blue: 96 / 255, alpha: 0.09)
            : UIColor(red: 248 / 255, green: 251 / 255, blue: 253 / 255, alpha: 1)
        button.layer.cornerRadius = 16
        button.contentHorizontalAlignment = .left
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 74).isActive = true
        button.accessibilityIdentifier = persona.personaId
        button.addTarget(self, action: #selector(handlePersonaRowTap(_:)), for: .touchUpInside)

        let avatar = UIImageView()
        avatar.translatesAutoresizingMaskIntoConstraints = false
        avatar.backgroundColor = UIColor(white: 0, alpha: 0.05)
        avatar.layer.cornerRadius = 12
        avatar.clipsToBounds = true
        avatar.contentMode = .scaleAspectFill
        button.addSubview(avatar)
        configureAvatarImageView(avatar, urlString: persona.avatarUrl, cornerRadius: 12)

        let nameLabel = UILabel()
        nameLabel.translatesAutoresizingMaskIntoConstraints = false
        nameLabel.text = persona.personaName
        nameLabel.font = UIFont.systemFont(ofSize: 16, weight: .bold)
        nameLabel.textColor = textColor
        button.addSubview(nameLabel)

        let lockChip = UILabel()
        lockChip.translatesAutoresizingMaskIntoConstraints = false
        lockChip.text = "잠금"
        lockChip.font = UIFont.systemFont(ofSize: 10, weight: .semibold)
        lockChip.textColor = UIColor(red: 126 / 255, green: 27 / 255, blue: 36 / 255, alpha: 1)
        lockChip.backgroundColor = UIColor(red: 252 / 255, green: 229 / 255, blue: 232 / 255, alpha: 1)
        lockChip.layer.cornerRadius = 10
        lockChip.layer.masksToBounds = true
        lockChip.textAlignment = .center
        lockChip.isHidden = !persona.isLocked
        button.addSubview(lockChip)

        let messageLabel = UILabel()
        messageLabel.translatesAutoresizingMaskIntoConstraints = false
        messageLabel.text = persona.lastMessage.isEmpty ? "새로운 대화" : persona.lastMessage
        messageLabel.font = UIFont.systemFont(ofSize: 12, weight: .regular)
        messageLabel.textColor = UIColor(red: 93 / 255, green: 96 / 255, blue: 90 / 255, alpha: 1)
        messageLabel.lineBreakMode = .byTruncatingTail
        button.addSubview(messageLabel)

        let activeDot = UIView()
        activeDot.translatesAutoresizingMaskIntoConstraints = false
        activeDot.backgroundColor = brandColor
        activeDot.layer.cornerRadius = 4
        activeDot.isHidden = !isActive
        button.addSubview(activeDot)

        NSLayoutConstraint.activate([
            avatar.leadingAnchor.constraint(equalTo: button.leadingAnchor, constant: 14),
            avatar.centerYAnchor.constraint(equalTo: button.centerYAnchor),
            avatar.widthAnchor.constraint(equalToConstant: 48),
            avatar.heightAnchor.constraint(equalToConstant: 48),

            nameLabel.topAnchor.constraint(equalTo: button.topAnchor, constant: 16),
            nameLabel.leadingAnchor.constraint(equalTo: avatar.trailingAnchor, constant: 12),
            nameLabel.trailingAnchor.constraint(lessThanOrEqualTo: lockChip.leadingAnchor, constant: -8),

            lockChip.centerYAnchor.constraint(equalTo: nameLabel.centerYAnchor),
            lockChip.trailingAnchor.constraint(equalTo: button.trailingAnchor, constant: -14),
            lockChip.heightAnchor.constraint(equalToConstant: 20),
            lockChip.widthAnchor.constraint(greaterThanOrEqualToConstant: 34),

            messageLabel.topAnchor.constraint(equalTo: nameLabel.bottomAnchor, constant: 4),
            messageLabel.leadingAnchor.constraint(equalTo: nameLabel.leadingAnchor),
            messageLabel.trailingAnchor.constraint(lessThanOrEqualTo: activeDot.leadingAnchor, constant: -10),
            messageLabel.bottomAnchor.constraint(lessThanOrEqualTo: button.bottomAnchor, constant: -14),

            activeDot.trailingAnchor.constraint(equalTo: button.trailingAnchor, constant: -16),
            activeDot.centerYAnchor.constraint(equalTo: button.centerYAnchor),
            activeDot.widthAnchor.constraint(equalToConstant: 8),
            activeDot.heightAnchor.constraint(equalToConstant: 8)
        ])

        return button
    }

    @objc private func handlePersonaRowTap(_ sender: UIButton) {
        guard let rawPersonaId = sender.accessibilityIdentifier else { return }
        let personaId = rawPersonaId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !personaId.isEmpty else { return }
        if let lockedPersona = resolveLockedPersona(for: personaId), lockedPersona.isLocked {
            showLockedPersonaOverlay(persona: lockedPersona)
            return
        }
        hidePersonaSheet()
        onSelectPersona?(personaId)
    }

    private func resolveLockedPersona(for personaId: String) -> NativeChatPersonaItem? {
        guard let state = currentState else { return nil }
        if let matched = state.personas.first(where: {
            $0.personaId.trimmingCharacters(in: .whitespacesAndNewlines) == personaId
        }) {
            return matched
        }

        let trimmedCurrentId = state.personaId.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedCurrentId == personaId {
            return NativeChatPersonaItem(
                personaId: trimmedCurrentId,
                personaName: state.personaName,
                avatarUrl: state.avatarUrl,
                lastMessage: "새로운 대화",
                isLocked: false
            )
        }

        return nil
    }

    private func showLockedPersonaOverlay(persona: NativeChatPersonaItem) {
        let name = persona.personaName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "이름" : persona.personaName
        let message = "\"\(name)\"의 대화는 현재 잠금 상태입니다.\n지금 구독하면 바로 다시 대화할 수 있어요."
        let alert = UIAlertController(title: "기억 패스가 만료되었어요", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "닫기", style: .cancel))
        alert.addAction(UIAlertAction(title: "구독하기", style: .default, handler: { [weak self] _ in
            self?.hidePersonaSheet()
            self?.onSubscribeMemoryPass?(persona.personaId, name)
        }))
        present(alert, animated: true)
    }

    @objc private func handleCreateMemory() {
        hidePersonaSheet()
        onCreateMemory?()
    }

    @objc private func handleBack() {
        view.endEditing(true)
        if isSheetVisible {
            hidePersonaSheet()
            return
        }
        dismiss(animated: true) { [weak self] in
            self?.onClose?()
        }
    }

    @objc private func handleBackSwipe(_ gesture: UIScreenEdgePanGestureRecognizer) {
        let translationX = gesture.translation(in: view).x
        let velocityX = gesture.velocity(in: view).x

        if gesture.state == .ended || gesture.state == .cancelled {
            if translationX > 56 || velocityX > 640 {
                handleBack()
            }
        }
    }

    @objc private func handleRightSwipeBack() {
        handleBack()
    }

    @objc private func handleSend() {
        if currentState?.isTyping == true {
            showSendBlockedNotice()
            return
        }
        let text = (textField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        textField.text = ""
        onSendMessage?(text)
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        handleSend()
        return true
    }

    func textFieldDidBeginEditing(_ textField: UITextField) {
        scrollToBottom(animated: true)
    }

    @objc private func handleGlobalTapToDismissKeyboard() {
        view.endEditing(true)
    }

    @objc private func handleKeyboardWillChangeFrame(_ note: Notification) {
        guard let userInfo = note.userInfo else { return }
        let duration = (userInfo[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?.doubleValue ?? 0.25
        let curveRaw = (userInfo[UIResponder.keyboardAnimationCurveUserInfoKey] as? NSNumber)?.intValue ?? 7
        let options = UIView.AnimationOptions(rawValue: UInt(curveRaw << 16))

        UIView.animate(withDuration: duration, delay: 0, options: options) {
            self.view.layoutIfNeeded()
            self.scrollToBottom(animated: false)
        }
    }

    func apply(state: NativeChatState) {
        if !Thread.isMainThread {
            DispatchQueue.main.async { [weak self] in
                self?.apply(state: state)
            }
            return
        }

        currentState = state
        titleLabel.text = state.personaName
        if let balance = state.memoryBalance {
            memoryLabel.text = "\(balance)"
            memoryBadgeView.isHidden = false
        } else {
            memoryLabel.text = ""
            memoryBadgeView.isHidden = true
        }

        updateAvatar(urlString: state.avatarUrl)
        rebuildMessages(state: state)
        if isSheetVisible {
            refreshPersonaSheet()
        }
    }

    private func rebuildMessages(state: NativeChatState) {
        stackView.arrangedSubviews.forEach { subview in
            stackView.removeArrangedSubview(subview)
            subview.removeFromSuperview()
        }

        if let firstMessage = state.messages.first {
            let dateWrap = UIView()
            dateWrap.translatesAutoresizingMaskIntoConstraints = false

            let dateLabel = UILabel()
            dateLabel.translatesAutoresizingMaskIntoConstraints = false
            dateLabel.font = UIFont.systemFont(ofSize: 11, weight: .semibold)
            dateLabel.textColor = textColor
            dateLabel.textAlignment = .center
            dateLabel.text = formatDateLabel(from: firstMessage.createdAt)
            dateWrap.addSubview(dateLabel)

            NSLayoutConstraint.activate([
                dateLabel.topAnchor.constraint(equalTo: dateWrap.topAnchor),
                dateLabel.centerXAnchor.constraint(equalTo: dateWrap.centerXAnchor),
                dateLabel.bottomAnchor.constraint(equalTo: dateWrap.bottomAnchor)
            ])

            stackView.addArrangedSubview(dateWrap)
        }

        for message in state.messages {
            let bubbleContainer = UIView()
            bubbleContainer.translatesAutoresizingMaskIntoConstraints = false
            bubbleContainer.backgroundColor = message.role == "user" ? userBubbleColor : assistantBubbleColor
            bubbleContainer.layer.cornerRadius = 24
            bubbleContainer.layer.masksToBounds = true
            if message.role == "user" {
                bubbleContainer.layer.maskedCorners = [.layerMinXMinYCorner, .layerMinXMaxYCorner, .layerMaxXMaxYCorner]
            } else {
                bubbleContainer.layer.maskedCorners = [.layerMinXMaxYCorner, .layerMaxXMinYCorner, .layerMaxXMaxYCorner]
            }

            let label = UILabel()
            label.translatesAutoresizingMaskIntoConstraints = false
            label.numberOfLines = 0
            label.font = UIFont.systemFont(ofSize: 15, weight: message.role == "user" ? .medium : .regular)
            let messageTextColor = message.role == "user"
                ? UIColor(red: 44 / 255, green: 58 / 255, blue: 70 / 255, alpha: 1)
                : textColor
            label.textColor = messageTextColor
            label.attributedText = makeMessageAttributedText(
                message.content,
                color: messageTextColor,
                font: label.font
            )
            bubbleContainer.addSubview(label)

            let timeLabel = UILabel()
            timeLabel.translatesAutoresizingMaskIntoConstraints = false
            timeLabel.font = UIFont.systemFont(ofSize: message.role == "user" ? 11 : 10, weight: .medium)
            timeLabel.textColor = message.role == "user" ? subtleTextColor : textColor
            timeLabel.text = formatTime(from: message.createdAt)

            let messageColumn = UIStackView()
            messageColumn.axis = .vertical
            messageColumn.spacing = 6
            messageColumn.translatesAutoresizingMaskIntoConstraints = false
            messageColumn.alignment = message.role == "user" ? .trailing : .leading
            messageColumn.addArrangedSubview(bubbleContainer)
            messageColumn.addArrangedSubview(timeLabel)

            let row = UIStackView()
            row.axis = .horizontal
            row.alignment = .top
            row.spacing = 8
            row.translatesAutoresizingMaskIntoConstraints = false

            if message.role == "assistant" {
                row.addArrangedSubview(makeAvatarView(size: 32, style: .circle))
                row.addArrangedSubview(messageColumn)
                row.addArrangedSubview(UIView())
            } else {
                row.addArrangedSubview(UIView())
                row.addArrangedSubview(messageColumn)
            }

            stackView.addArrangedSubview(row)

            NSLayoutConstraint.activate([
                label.topAnchor.constraint(equalTo: bubbleContainer.topAnchor, constant: 17),
                label.leadingAnchor.constraint(equalTo: bubbleContainer.leadingAnchor, constant: 14),
                label.trailingAnchor.constraint(equalTo: bubbleContainer.trailingAnchor, constant: -14),
                label.bottomAnchor.constraint(equalTo: bubbleContainer.bottomAnchor, constant: -17),
                bubbleContainer.widthAnchor.constraint(lessThanOrEqualTo: row.widthAnchor, multiplier: 0.84)
            ])
        }

        if state.isTyping {
            let typingBubble = UIView()
            typingBubble.translatesAutoresizingMaskIntoConstraints = false
            typingBubble.backgroundColor = assistantBubbleColor
            typingBubble.layer.cornerRadius = 16
            typingBubble.layer.masksToBounds = true
            typingBubble.setContentHuggingPriority(.required, for: .horizontal)
            typingBubble.setContentCompressionResistancePriority(.required, for: .horizontal)

            let typingDotsView = TypingDotsView()
            typingBubble.addSubview(typingDotsView)

            let row = UIStackView()
            row.axis = .horizontal
            row.alignment = .top
            row.spacing = 8
            row.translatesAutoresizingMaskIntoConstraints = false
            row.addArrangedSubview(makeAvatarView(size: 32, style: .circle))
            row.addArrangedSubview(typingBubble)
            row.addArrangedSubview(UIView())

            stackView.addArrangedSubview(row)

            NSLayoutConstraint.activate([
                typingBubble.heightAnchor.constraint(greaterThanOrEqualToConstant: 36),
                typingBubble.widthAnchor.constraint(lessThanOrEqualToConstant: 72),
                typingDotsView.topAnchor.constraint(equalTo: typingBubble.topAnchor, constant: 12),
                typingDotsView.leadingAnchor.constraint(equalTo: typingBubble.leadingAnchor, constant: 12),
                typingDotsView.trailingAnchor.constraint(equalTo: typingBubble.trailingAnchor, constant: -12),
                typingDotsView.bottomAnchor.constraint(equalTo: typingBubble.bottomAnchor, constant: -12)
            ])
        }

        scrollToBottom(animated: true)
    }

    private func scrollToBottom(animated: Bool) {
        view.layoutIfNeeded()
        let targetY = max(-scrollView.adjustedContentInset.top, scrollView.contentSize.height - scrollView.bounds.height + scrollView.adjustedContentInset.bottom)
        scrollView.setContentOffset(CGPoint(x: 0, y: targetY), animated: animated)
    }

    private func makeAvatarView(size: CGFloat, style: AvatarStyle) -> UIView {
        let wrapper = UIView()
        wrapper.translatesAutoresizingMaskIntoConstraints = false
        wrapper.widthAnchor.constraint(equalToConstant: size).isActive = true
        wrapper.heightAnchor.constraint(equalToConstant: size).isActive = true
        wrapper.backgroundColor = UIColor(white: 0, alpha: 0.05)
        wrapper.layer.cornerRadius = style == .circle ? size / 2 : 10
        wrapper.layer.masksToBounds = true

        if let image = currentAvatarImage {
            let imageView = UIImageView(image: image)
            imageView.translatesAutoresizingMaskIntoConstraints = false
            imageView.contentMode = .scaleAspectFill
            imageView.clipsToBounds = true
            wrapper.addSubview(imageView)
            NSLayoutConstraint.activate([
                imageView.topAnchor.constraint(equalTo: wrapper.topAnchor),
                imageView.leadingAnchor.constraint(equalTo: wrapper.leadingAnchor),
                imageView.trailingAnchor.constraint(equalTo: wrapper.trailingAnchor),
                imageView.bottomAnchor.constraint(equalTo: wrapper.bottomAnchor)
            ])
        } else {
            let fallback = UIView()
            fallback.translatesAutoresizingMaskIntoConstraints = false
            fallback.backgroundColor = UIColor(red: 230 / 255, green: 233 / 255, blue: 226 / 255, alpha: 1)
            fallback.layer.cornerRadius = style == .circle ? size / 2 : 10
            fallback.layer.masksToBounds = true
            wrapper.addSubview(fallback)

            let icon = UIImageView(image: UIImage(systemName: "person.crop.circle"))
            icon.translatesAutoresizingMaskIntoConstraints = false
            icon.tintColor = brandColor
            fallback.addSubview(icon)

            NSLayoutConstraint.activate([
                fallback.topAnchor.constraint(equalTo: wrapper.topAnchor),
                fallback.leadingAnchor.constraint(equalTo: wrapper.leadingAnchor),
                fallback.trailingAnchor.constraint(equalTo: wrapper.trailingAnchor),
                fallback.bottomAnchor.constraint(equalTo: wrapper.bottomAnchor),
                icon.centerXAnchor.constraint(equalTo: fallback.centerXAnchor),
                icon.centerYAnchor.constraint(equalTo: fallback.centerYAnchor),
                icon.widthAnchor.constraint(equalToConstant: max(size * 0.58, 14)),
                icon.heightAnchor.constraint(equalToConstant: max(size * 0.58, 14))
            ])
        }

        return wrapper
    }

    private func configureAvatarImageView(_ imageView: UIImageView, urlString: String?, cornerRadius: CGFloat) {
        imageView.layer.cornerRadius = cornerRadius
        imageView.backgroundColor = UIColor(red: 230 / 255, green: 233 / 255, blue: 226 / 255, alpha: 1)
        imageView.image = UIImage(systemName: "person.crop.circle")
        imageView.tintColor = brandColor

        guard
            let raw = urlString?.trimmingCharacters(in: .whitespacesAndNewlines),
            !raw.isEmpty,
            let url = URL(string: raw),
            let scheme = url.scheme?.lowercased(),
            scheme == "http" || scheme == "https"
        else {
            return
        }

        let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 8)
        URLSession.shared.dataTask(with: request) { data, _, _ in
            guard let data, let image = UIImage(data: data) else { return }
            DispatchQueue.main.async {
                imageView.image = image
                imageView.tintColor = nil
            }
        }.resume()
    }

    private func makeMessageAttributedText(_ text: String, color: UIColor, font: UIFont) -> NSAttributedString {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 3.4
        paragraph.lineBreakMode = .byWordWrapping

        return NSAttributedString(
            string: text,
            attributes: [
                .font: font,
                .foregroundColor: color,
                .paragraphStyle: paragraph
            ]
        )
    }

    private func updateAvatar(urlString: String?) {
        let trimmed = urlString?.trimmingCharacters(in: .whitespacesAndNewlines)
        if currentAvatarURL == trimmed {
            applyHeaderAvatar()
            return
        }

        avatarTask?.cancel()
        currentAvatarURL = trimmed
        currentAvatarImage = nil
        applyHeaderAvatar()

        guard
            let trimmed,
            let url = URL(string: trimmed),
            let scheme = url.scheme?.lowercased(),
            scheme == "http" || scheme == "https"
        else {
            return
        }

        let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 10)
        avatarTask = URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            guard let self else { return }
            guard let data, let image = UIImage(data: data) else { return }
            DispatchQueue.main.async {
                guard self.currentAvatarURL == trimmed else { return }
                self.currentAvatarImage = image
                self.applyHeaderAvatar()
                if let state = self.currentState {
                    self.rebuildMessages(state: state)
                }
            }
        }
        avatarTask?.resume()
    }

    private func applyHeaderAvatar() {
        if let image = currentAvatarImage {
            headerAvatarImageView.image = image
            headerAvatarImageView.isHidden = false
            headerAvatarFallbackView.isHidden = true
        } else {
            headerAvatarImageView.image = nil
            headerAvatarImageView.isHidden = true
            headerAvatarFallbackView.isHidden = false
        }
    }

    private func parseISODate(_ iso: String) -> Date? {
        let parser = ISO8601DateFormatter()
        if let date = parser.date(from: iso) {
            return date
        }
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return parser.date(from: iso)
    }

    private func formatTime(from iso: String) -> String {
        guard let date = parseISODate(iso) else { return "" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "a h:mm"
        return formatter.string(from: date)
    }

    private func formatDateLabel(from iso: String) -> String {
        guard let date = parseISODate(iso) else { return "" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "M월 d일 EEEE"
        return formatter.string(from: date)
    }

    private func showSendBlockedNotice() {
        let personaName = currentState?.personaName.trimmingCharacters(in: .whitespacesAndNewlines) ?? "내 기억"
        let targetText = "\(personaName)이 입력중에는 메시지를 보낼 수 없습니다."
        blockedNoticeLabel.text = "  \(targetText)  "
        blockedNoticeLabel.isHidden = false
        blockedNoticeLabel.alpha = 0
        blockedNoticeLabel.layer.removeAllAnimations()

        UIView.animate(withDuration: 0.18, animations: {
            self.blockedNoticeLabel.alpha = 1
        }, completion: { _ in
            UIView.animate(withDuration: 0.2, delay: 1.2, options: [.curveEaseInOut], animations: {
                self.blockedNoticeLabel.alpha = 0
            }, completion: { _ in
                self.blockedNoticeLabel.isHidden = true
            })
        })
    }
}

@objc(NativeChatPlugin)
public final class NativeChatPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeChatPlugin"
    public let jsName = "NativeChat"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dismiss", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirmMemoryStore", returnType: CAPPluginReturnPromise)
    ]

    private var nativeChatViewController: NativeChatViewController?

    private func runOnMain(_ work: @escaping () -> Void) {
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }

    @objc public func present(_ call: CAPPluginCall) {
        let state = parseState(from: call, fallback: nil)

        runOnMain { [weak self] in
            guard let self else {
                call.reject("Plugin is unavailable.")
                return
            }
            guard let bridgeViewController = self.bridge?.viewController else {
                call.reject("Bridge view controller is unavailable.")
                return
            }

            if let existing = self.nativeChatViewController {
                existing.apply(state: state)
                call.resolve()
                return
            }

            let controller = NativeChatViewController()
            controller.modalPresentationStyle = .custom
            controller.transitioningDelegate = NativeChatTransitioningDelegate.shared
            controller.apply(state: state)
            controller.onSendMessage = { [weak self] text in
                self?.notifyListeners("sendMessage", data: ["text": text])
            }
            controller.onClose = { [weak self] in
                self?.nativeChatViewController = nil
                self?.notifyListeners("close", data: [:])
            }
            controller.onSelectPersona = { [weak self] personaId in
                self?.notifyListeners("selectPersona", data: ["personaId": personaId])
            }
            controller.onSubscribeMemoryPass = { [weak self] personaId, personaName in
                self?.notifyListeners("subscribeMemoryPass", data: [
                    "personaId": personaId,
                    "personaName": personaName
                ])
            }
            controller.onCreateMemory = { [weak self] in
                self?.notifyListeners("createMemory", data: [:])
            }

            self.nativeChatViewController = controller
            bridgeViewController.present(controller, animated: true) {
                call.resolve()
            }
        }
    }

    @objc public func sync(_ call: CAPPluginCall) {
        let state = parseState(from: call, fallback: nil)
        runOnMain { [weak self] in
            guard let self else {
                call.reject("Plugin is unavailable.")
                return
            }
            guard let controller = self.nativeChatViewController else {
                call.resolve()
                return
            }
            controller.apply(state: state)
            call.resolve()
        }
    }

    @objc public func dismiss(_ call: CAPPluginCall) {
        runOnMain { [weak self] in
            guard let self else {
                call.reject("Plugin is unavailable.")
                return
            }
            guard let controller = self.nativeChatViewController else {
                call.resolve()
                return
            }
            controller.dismiss(animated: true) { [weak self] in
                self?.nativeChatViewController = nil
                call.resolve()
            }
        }
    }

    @objc public func confirmMemoryStore(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? "기억이 부족해요"
        let message = call.getString("message") ?? "확인을 누르면 기억 스토어로 이동합니다."
        let confirmText = call.getString("confirmText") ?? "확인"
        let cancelText = call.getString("cancelText") ?? "취소"

        runOnMain { [weak self] in
            guard let self else {
                call.reject("Plugin is unavailable.")
                return
            }
            guard let bridgeViewController = self.bridge?.viewController else {
                call.reject("Bridge view controller is unavailable.")
                return
            }

            let presenter = self.nativeChatViewController ?? bridgeViewController.presentedViewController ?? bridgeViewController
            let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)

            alert.addAction(UIAlertAction(title: cancelText, style: .cancel, handler: { _ in
                call.resolve(["confirmed": false])
            }))
            alert.addAction(UIAlertAction(title: confirmText, style: .default, handler: { _ in
                call.resolve(["confirmed": true])
            }))

            presenter.present(alert, animated: true)
        }
    }

    private func parseState(from call: CAPPluginCall, fallback: NativeChatState?) -> NativeChatState {
        let personaId = call.getString("personaId") ?? fallback?.personaId ?? ""
        let personaName = call.getString("personaName") ?? fallback?.personaName ?? "기억"
        let avatarUrl = call.getString("avatarUrl") ?? fallback?.avatarUrl
        let isTyping = call.getBool("isTyping") ?? fallback?.isTyping ?? false
        let memoryBalance = call.getInt("memoryBalance") ?? fallback?.memoryBalance

        func normalizeDictionary(_ raw: Any) -> [String: Any]? {
            if let dictionary = raw as? [String: Any] {
                return dictionary
            }
            if let dictionary = raw as? [AnyHashable: Any] {
                var normalized: [String: Any] = [:]
                for (key, value) in dictionary {
                    normalized[String(describing: key)] = value
                }
                return normalized
            }
            return nil
        }

        let rawMessages = call.options["messages"] as? [Any] ?? []
        let parsedMessages = rawMessages
            .compactMap { normalizeDictionary($0) }
            .compactMap { NativeChatMessageItem(dictionary: $0) }

        let rawPersonas = call.options["personas"] as? [Any] ?? []
        let parsedPersonas = rawPersonas
            .compactMap { normalizeDictionary($0) }
            .compactMap { NativeChatPersonaItem(dictionary: $0) }

        return NativeChatState(
            personaId: personaId,
            personaName: personaName,
            avatarUrl: avatarUrl,
            messages: parsedMessages.isEmpty ? (fallback?.messages ?? []) : parsedMessages,
            isTyping: isTyping,
            memoryBalance: memoryBalance,
            personas: parsedPersonas.isEmpty ? (fallback?.personas ?? []) : parsedPersonas
        )
    }
}

@objc(NativeAppleAuthPlugin)
public final class NativeAppleAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "NativeAppleAuthPlugin"
    public let jsName = "NativeAppleAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var activePresentationAnchor: ASPresentationAnchor?
    private var activeController: ASAuthorizationController?
    private var pendingStartedAt: Date?
    private var completionTimeoutWorkItem: DispatchWorkItem?

    private func clearTimeout() {
        completionTimeoutWorkItem?.cancel()
        completionTimeoutWorkItem = nil
    }

    private func clearPendingState() {
        clearTimeout()
        pendingCall = nil
        activePresentationAnchor = nil
        activeController = nil
        pendingStartedAt = nil
    }

    private func takePendingCall() -> CAPPluginCall? {
        let call = pendingCall
        clearPendingState()
        return call
    }

    private func scheduleCompletionTimeout() {
        clearTimeout()
        let workItem = DispatchWorkItem { [weak self] in
            guard let self else { return }
            guard let call = self.takePendingCall() else { return }
            call.reject("Apple 로그인 응답이 지연되고 있습니다. 다시 시도해주세요.")
        }
        completionTimeoutWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 45, execute: workItem)
    }

    private func resolvePresentationAnchor() -> ASPresentationAnchor? {
        if let window = bridge?.viewController?.view.window {
            return window
        }
        if let window = bridge?.viewController?.viewIfLoaded?.window {
            return window
        }

        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
        if let keyWindow = windows.first(where: { $0.isKeyWindow }) {
            return keyWindow
        }
        return windows.first
    }

    @objc public func signIn(_ call: CAPPluginCall) {
        if #available(iOS 13.0, *) {
            DispatchQueue.main.async { [weak self] in
                guard let self else {
                    call.reject("Plugin is unavailable.")
                    return
                }
                if let startedAt = self.pendingStartedAt,
                   Date().timeIntervalSince(startedAt) > 45 {
                    self.clearPendingState()
                }
                guard self.pendingCall == nil else {
                    call.reject("Apple 로그인 진행 중입니다.")
                    return
                }
                guard let anchor = self.resolvePresentationAnchor() else {
                    call.reject("Apple 로그인 화면을 표시할 수 없습니다. 앱을 다시 열고 시도해주세요.")
                    return
                }

                let request = ASAuthorizationAppleIDProvider().createRequest()
                request.requestedScopes = [.fullName, .email]
                if let state = call.getString("state"), !state.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    request.state = state
                }

                let controller = ASAuthorizationController(authorizationRequests: [request])
                controller.delegate = self
                controller.presentationContextProvider = self

                self.pendingCall = call
                self.activePresentationAnchor = anchor
                self.activeController = controller
                self.pendingStartedAt = Date()
                self.scheduleCompletionTimeout()
                controller.performRequests()
            }
            return
        }

        call.reject("iOS 13 이상에서만 Apple 로그인이 지원됩니다.")
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let anchor = activePresentationAnchor {
            return anchor
        }
        if let fallback = resolvePresentationAnchor() {
            return fallback
        }
        return ASPresentationAnchor(frame: .zero)
    }

    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let call = takePendingCall() else { return }

        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            call.reject("Apple 인증 결과를 읽지 못했습니다.")
            return
        }

        guard let identityTokenData = credential.identityToken,
              let identityToken = String(data: identityTokenData, encoding: .utf8),
              !identityToken.isEmpty else {
            call.reject("Apple identity token을 받지 못했습니다.")
            return
        }

        var result: [String: Any] = [
            "identityToken": identityToken,
            "userIdentifier": credential.user
        ]

        if let authorizationCodeData = credential.authorizationCode,
           let authorizationCode = String(data: authorizationCodeData, encoding: .utf8),
           !authorizationCode.isEmpty {
            result["authorizationCode"] = authorizationCode
        }

        if let email = credential.email, !email.isEmpty {
            result["email"] = email
        }

        if let givenName = credential.fullName?.givenName, !givenName.isEmpty {
            result["givenName"] = givenName
        }

        if let familyName = credential.fullName?.familyName, !familyName.isEmpty {
            result["familyName"] = familyName
        }

        call.resolve(result)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = takePendingCall() else { return }

        let nsError = error as NSError
        if nsError.domain == ASAuthorizationError.errorDomain, nsError.code == ASAuthorizationError.canceled.rawValue {
            call.reject("사용자가 Apple 로그인을 취소했습니다.")
            return
        }
        let failureReason = nsError.localizedFailureReason ?? "none"
        let recoverySuggestion = nsError.localizedRecoverySuggestion ?? "none"
        let userInfo = nsError.userInfo
            .map { "\($0.key)=\($0.value)" }
            .sorted()
            .joined(separator: ", ")
        var detailMessage = "Apple 로그인에 실패했습니다. [\(nsError.domain):\(nsError.code)] \(nsError.localizedDescription) reason=\(failureReason) suggestion=\(recoverySuggestion)"
        if nsError.domain == ASAuthorizationError.errorDomain, nsError.code == ASAuthorizationError.unknown.rawValue {
            detailMessage += " (시뮬레이터 설정에서 Apple ID/iCloud 로그인을 확인해주세요.)"
        }
        NSLog("[NativeAppleAuth] \(detailMessage) userInfo={\(userInfo)}")
        call.reject(detailMessage, nil, error)
    }
}

@objc(NativeIapPlugin)
public final class NativeIapPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeIapPlugin"
    public let jsName = "NativeIap"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise)
    ]

    private let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private func resolveOnMain(_ call: CAPPluginCall, data: [String: Any]) {
        DispatchQueue.main.async {
            call.resolve(data)
        }
    }

    private func rejectOnMain(_ call: CAPPluginCall, message: String, error: Error? = nil) {
        DispatchQueue.main.async {
            call.reject(message, nil, error)
        }
    }

    @objc public func purchase(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.reject("iOS 15 이상에서만 인앱결제를 지원합니다.")
            return
        }

        let productId = (call.getString("productId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !productId.isEmpty else {
            call.reject("상품 ID가 필요합니다.")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    rejectOnMain(call, message: "스토어에서 상품을 찾을 수 없습니다. productId=\(productId)")
                    return
                }

                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        let payload = makePurchasePayload(
                            transaction: transaction,
                            productId: productId,
                            verificationStatus: "verified"
                        )
                        await transaction.finish()
                        resolveOnMain(call, data: payload)
                    case .unverified(let transaction, let verificationError):
                        var payload = makePurchasePayload(
                            transaction: transaction,
                            productId: productId,
                            verificationStatus: "unverified"
                        )
                        payload["verificationError"] = verificationError.localizedDescription
                        rejectOnMain(
                            call,
                            message: "결제 검증에 실패했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.",
                            error: verificationError
                        )
                    }
                case .pending:
                    rejectOnMain(call, message: "결제가 보류 상태입니다. 결제 승인이 완료되면 다시 시도해주세요.")
                case .userCancelled:
                    rejectOnMain(call, message: "사용자가 결제를 취소했습니다.")
                @unknown default:
                    rejectOnMain(call, message: "알 수 없는 결제 상태입니다.")
                }
            } catch {
                rejectOnMain(call, message: "결제를 진행하지 못했습니다. \(error.localizedDescription)", error: error)
            }
        }
    }

    @objc public func restore(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.reject("iOS 15 이상에서만 구매 복원을 지원합니다.")
            return
        }

        Task {
            do {
                try await AppStore.sync()

                var restoredItems: [[String: Any]] = []
                for await entitlement in Transaction.currentEntitlements {
                    switch entitlement {
                    case .verified(let transaction):
                        if transaction.revocationDate != nil {
                            continue
                        }
                        if let expirationDate = transaction.expirationDate, expirationDate < Date() {
                            continue
                        }
                        let payload = makePurchasePayload(
                            transaction: transaction,
                            productId: transaction.productID,
                            verificationStatus: "verified",
                            source: "native_storekit2_restore"
                        )
                        restoredItems.append(payload)
                    case .unverified:
                        continue
                    }
                }

                resolveOnMain(
                    call,
                    data: [
                        "ok": true,
                        "count": restoredItems.count,
                        "restored": restoredItems
                    ]
                )
            } catch {
                rejectOnMain(call, message: "구매 복원에 실패했습니다. \(error.localizedDescription)", error: error)
            }
        }
    }

    @available(iOS 15.0, *)
    private func makePurchasePayload(
        transaction: StoreKit.Transaction,
        productId: String,
        verificationStatus: String,
        source: String = "native_storekit2"
    ) -> [String: Any] {
        var rawPayload: [String: Any] = [
            "source": source,
            "verificationStatus": verificationStatus,
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "productId": transaction.productID,
            "productIdRequested": productId,
            "purchaseDate": isoFormatter.string(from: transaction.purchaseDate),
            "environment": String(describing: transaction.environment),
            "productType": String(describing: transaction.productType),
            "ownershipType": String(describing: transaction.ownershipType)
        ]

        if let expirationDate = transaction.expirationDate {
            rawPayload["expirationDate"] = isoFormatter.string(from: expirationDate)
        }
        if let revocationDate = transaction.revocationDate {
            rawPayload["revocationDate"] = isoFormatter.string(from: revocationDate)
        }
        if let appAccountToken = transaction.appAccountToken {
            rawPayload["appAccountToken"] = appAccountToken.uuidString
        }

        return [
            "productId": transaction.productID,
            "transactionId": String(transaction.id),
            "orderId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "purchasedAt": isoFormatter.string(from: transaction.purchaseDate),
            "rawPayload": rawPayload
        ]
    }
}
