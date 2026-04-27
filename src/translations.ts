export type Lang = "de" | "en";

export const translations = {
  de: {
    // General
    dashboard: "Dashboard",
    trading: "Trading",
    forum: "Forum",
    leaderboard: "Leaderboard",
    airdrop: "Airdrop",
    walletConnect: "Investor Access",
    walletConnectHint:
      "Verbinde deine Wallet für sicheren Investor-Zugang zum DMD-Protokoll.",
    status: "Status",
    hint: "Hinweis",
    protocolNotice: "Protocol Notice",
    errorLabel: "ERROR",
    statusOkLabel: "STATUS OK",
    hintLabel: "HINWEIS",
    yes: "YES",
    no: "NO",
    unavailable: "—",

    // Dashboard
    vaultOwnerMatch: "Vault Owner Match",
    treasuryMatch: "Treasury Match",
    sellStatus: "Sell Status",
    pricingMode: "Pricing Mode",
    program: "Programm",
    mint: "Mint",
    dmdPriceDex: "Market Status",
    dmdAppValue: "DMD Strategic Value",
    solPriceUsd: "SOL Preis (USD)",
    live: "VERIFIED",
    blocked: "BLOCKED",
    unknown: "UNKNOWN",
    dynamic: "Dynamisch",
    manual: "Manuell",
    publicFeed: "Public Feed",
    treasuryFeed: "Treasury Feed",

    // Trading
    walletOverview: "Wallet Übersicht",
    yourDmd: "Dein DMD",
    dmdMarketDex: "DMD Market Status",
    yourDmdDexValue: "DMD Strategic Value",
    claimCounter: "Claim Counter",
    buyCountToday: "Käufe heute",
    buyCooldown: "Buy Cooldown",
    sellCountWindow: "Sell Count Window",
    freeSellsInWindow: "Freie Sells im Fenster",
    extraSellApprovals: "Extra Sell Freigaben",
    sellWindowReset: "Sell Window Reset",
    treasurySol: "Treasury Backing (SOL)",
    vaultDmd: "Reward Vault (DMD)",
    sellRoute: "Sell Route",
    free: "frei",
    resetUtc: "Reset täglich um 00:00 UTC",

    tradingNotice: "Trading Hinweis",
    sellOnchainLive: "Sell / DMD→SOL ist on-chain freigegeben.",
    sellOnchainBlocked:
      "Controlled Treasury Phase aktiv. Öffentliche DEX-Liquidität wird strategisch vorbereitet.",
    investorClientNotice:
      "DMD befindet sich bewusst in der kontrollierten Treasury-Phase. Buy und Claim bleiben der sichere Standardpfad; öffentliche DEX-Liquidität wird erst nach strategischer Aktivierung geöffnet.",

    whitelist: "Whitelist",
    notApprovedYet: "Du bist noch nicht freigeschaltet.",
    autoWhitelist: "Auto-Whitelist",

    v2Activation: "V2 Aktivierung",
    legacyWalletNotice:
      "Deine Wallet stammt noch aus dem Legacy-Stand. Für den finalen V2-Pfad muss einmal BuyerStateExtV2 angelegt werden. Danach läuft die App nur noch über die echte gehärtete On-chain-Logik.",
    initV2Status: "V2 STATUS INITIALISIEREN",

    solToDmd: "SOL → DMD",
    dmdToSol: "DMD → SOL",
    slippagePct: "Slippage (%)",
    buyRange: "Buy Bereich",
    dailyLimit: "Tageslimit",
    buys: "Buys",
    cooldownMayApply: "Danach kann ein Cooldown greifen.",
    buyDmd: "BUY DMD",
    claim: "CLAIM",
    sellCurrentlyBlocked: "DMD → SOL AKTUELL BLOCKIERT",
    sellStatusLive: "DMD → SOL STATUS LIVE",
    sellOnchainEnabled: "Sell ist on-chain freigegeben.",
    sellOnchainStillBlocked:
      "Controlled Treasury Phase aktiv. Öffentliche DEX-Liquidität wird strategisch vorbereitet.",
    claimRemainsAvailable:
      "Claim bleibt verfügbar, sobald die Bedingungen erfüllt sind.",
    claimNotAvailableTitle: "Noch nicht verfügbar",
    claimAvailableTitle: "Claim verfügbar",
    sellAvailableTitle: "Sell verfügbar",
    sellDisabledTitle: "Sell on-chain noch deaktiviert",

    legacyWalletDetected:
      "Legacy-Wallet erkannt: BuyerState vorhanden, BuyerStateExtV2 fehlt noch.",
    conservativeDisplayNotice:
      "Die Anzeige basiert konservativ auf On-chain BuyerState, BuyerStateExtV2 und VaultConfigV2. Maßgeblich bleibt die Blockchain.",
    onchainLive: "ON-CHAIN VERIFIED",
    onchainBlocked: "ON-CHAIN BLOCKED",

    buyCountLegendZero: "0 Buys",
    buyCountLegendLow: "1–4",
    buyCountLegendMid: "5–9",
    buyCountLegendLimit: "10 = Tageslimit",

    // Forum / Leaderboard / Airdrop
    communityForum: "Community Forum",
    forumBackendDisabled:
      "Das Forum ist ohne Backend absichtlich im Schreibmodus deaktiviert.\nGrund: Kein lokaler LocalStorage-Fallback im produktiven Investor-Flow.",
    topDmdHolder: "Top DMD Holder",
    protocolOwnerAirdrop: "Protocol Owner – Smart Airdrop Preview",
    ownerOnlyArea:
      "Nur der aktuelle Protocol Owner kann diesen Bereich sehen.",

    // Public notices
    founderOwnerFeedsHidden:
      "Founder-/Owner-spezifische Feeds sind absichtlich nicht Teil des öffentlichen Investor-Flows.",
    onchainSourceNotice:
      "On-chain state is the source of truth. The app shows a conservative public surface.",

    // Runtime / actions
    walletConnectAlert: "Wallet verbinden.",
    autoWhitelistInProgress: "Auto-Whitelist…",
    buyInProgress: "Buy…",
    claimInProgress: "Claim…",
    v2InitInProgress: "Initialisiere BuyerStateExtV2…",

    whitelistSent: "Whitelist gesendet:",
    buySent: "Buy gesendet:",
    claimSent: "Claim gesendet:",
    v2StatusInitialized: "V2-Status initialisiert:",
    v2StatusInitializedSuffix:
      "Bitte danach Claim / Trading erneut nutzen.",
    v2StatusInitializedClaimRetry:
      "Bitte Claim jetzt erneut drücken.",

    // Validation / flow messages
    autoWhitelistRequiresMinBuy:
      "Auto-Whitelist erfordert mindestens {min} SOL Kaufabsicht.",
    buyRangeError: "Buy-Bereich: {min} bis {max} SOL.",
    walletNotApproved: "Wallet ist nicht freigeschaltet.",
    noBuyerState: "Kein BuyerState vorhanden.",
    invalidDmdAmount: "Bitte eine gültige DMD-Menge eingeben.",
    legacyWalletInitFirst:
      "Legacy-Wallet erkannt. Bitte zuerst BuyerStateExtV2 initialisieren.",
    legacyWalletClaimInitFirst:
      "Legacy-Wallet erkannt. Initialisiere zuerst BuyerStateExtV2…",
    claimUnavailablePrefix: "Claim nicht verfügbar - ",
    sellFoundationPhaseBlocked:
      "Kein Sell möglich während der kontrollierten Treasury-Phase.",

    // Sell flow explanation
    sellPublicClientNotice:
      "DMD befindet sich bewusst in der kontrollierten Treasury-Phase. Der Public-Investor-Client führt den DMD→SOL-Pfad aktuell nicht direkt aus, weil die bestehende On-chain-Sell-Route treasury-seitig signergebunden ist. Die App zeigt den echten Status, täuscht aber keinen öffentlichen DEX-Sell-Flow vor.",

    // Error prefixes
    whitelistErrorPrefix: "Whitelist Fehler: ",
    buyErrorPrefix: "Buy Fehler: ",
    claimErrorPrefix: "Claim Fehler: ",
    sellHintPrefix: "Sell Hinweis: ",
    v2InitErrorPrefix: "V2 Init Fehler: ",

    // Normalized runtime errors
    sellDisabledFrontend:
      "DMD→SOL ist aktuell bewusst im öffentlichen Investor-Frontend deaktiviert.",
    buyCooldownActive:
      "Buy-Cooldown aktiv. Bitte warte, bis der Cooldown abgelaufen ist.",
    buyDailyLimitExceeded:
      "Tageslimit erreicht. Weitere Buys sind vorübergehend gesperrt.",
    legacyClaimFlowDisabled:
      "Nur Claim V2 ist aktiv. Bitte App-Stand prüfen.",
    sellTemporarilyDisabled:
      "Sell ist während der kontrollierten Treasury-Phase derzeit deaktiviert.",
    invalidTreasury:
      "Treasury-Konfiguration stimmt nicht mit der On-chain-Wahrheit überein.",
    invalidOwner:
      "Owner-Konfiguration stimmt nicht mit der On-chain-Wahrheit überein.",
    rewardTooSmall: "Reward aktuell zu klein für einen Claim.",
    insufficientVaultRewardLiquidity:
      "Nicht genug Reward-Liquidität im Vault.",
    insufficientTreasuryLiquidity:
      "Die Treasury hat aktuell nicht genug Liquidität für diesen Pfad.",
    extraSellApprovalRequired:
      "Zusätzliche Sell-Freigabe erforderlich.",

    // Policy / timer texts
    claimAvailableNow: "✅ Claim verfügbar",
    claimAvailableIn: "⏳ Claim in {time}",
    sellWindowResetPending: "Reset fällig / nächstes Fenster aktiv",
  },

  en: {
    // General
    dashboard: "Dashboard",
    trading: "Trading",
    forum: "Forum",
    leaderboard: "Leaderboard",
    airdrop: "Airdrop",
    walletConnect: "Investor Access",
    walletConnectHint:
      "Connect your wallet for secure investor access to the DMD protocol.",
    status: "Status",
    hint: "Notice",
    protocolNotice: "Protocol Notice",
    errorLabel: "ERROR",
    statusOkLabel: "STATUS OK",
    hintLabel: "NOTICE",
    yes: "YES",
    no: "NO",
    unavailable: "—",

    // Dashboard
    vaultOwnerMatch: "Vault Owner Match",
    treasuryMatch: "Treasury Match",
    sellStatus: "Sell Status",
    pricingMode: "Pricing Mode",
    program: "Program",
    mint: "Mint",
    dmdPriceDex: "Market Status",
    dmdAppValue: "DMD Strategic Value",
    solPriceUsd: "SOL Price (USD)",
    live: "VERIFIED",
    blocked: "BLOCKED",
    unknown: "UNKNOWN",
    dynamic: "Dynamic",
    manual: "Manual",
    publicFeed: "Public Feed",
    treasuryFeed: "Treasury Feed",

    // Trading
    walletOverview: "Wallet Overview",
    yourDmd: "Your DMD",
    dmdMarketDex: "DMD Market Status",
    yourDmdDexValue: "DMD Strategic Value",
    claimCounter: "Claim Counter",
    buyCountToday: "Buys Today",
    buyCooldown: "Buy Cooldown",
    sellCountWindow: "Sell Count Window",
    freeSellsInWindow: "Free Sells In Window",
    extraSellApprovals: "Extra Sell Approvals",
    sellWindowReset: "Sell Window Reset",
    treasurySol: "Treasury Backing (SOL)",
    vaultDmd: "Reward Vault (DMD)",
    sellRoute: "Sell Route",
    free: "free",
    resetUtc: "Resets daily at 00:00 UTC",

    tradingNotice: "Trading Notice",
    sellOnchainLive: "Sell / DMD→SOL is enabled on-chain.",
    sellOnchainBlocked:
      "Controlled Treasury Phase active. Public DEX liquidity is being prepared strategically.",
    investorClientNotice:
      "DMD is intentionally operating in a controlled treasury phase. Buy and claim remain the secure standard path; public DEX liquidity opens only after strategic activation.",

    whitelist: "Whitelist",
    notApprovedYet: "Your wallet is not approved yet.",
    autoWhitelist: "Auto Whitelist",

    v2Activation: "V2 Activation",
    legacyWalletNotice:
      "Your wallet is still on the legacy state. For the final V2 path, BuyerStateExtV2 must be created once. After that, the app runs only through the real hardened on-chain logic.",
    initV2Status: "INITIALIZE V2 STATUS",

    solToDmd: "SOL → DMD",
    dmdToSol: "DMD → SOL",
    slippagePct: "Slippage (%)",
    buyRange: "Buy Range",
    dailyLimit: "Daily Limit",
    buys: "buys",
    cooldownMayApply: "A cooldown may apply afterwards.",
    buyDmd: "BUY DMD",
    claim: "CLAIM",
    sellCurrentlyBlocked: "DMD → SOL CURRENTLY BLOCKED",
    sellStatusLive: "DMD → SOL STATUS LIVE",
    sellOnchainEnabled: "Sell is enabled on-chain.",
    sellOnchainStillBlocked:
      "Controlled Treasury Phase active. Public DEX liquidity is being prepared strategically.",
    claimRemainsAvailable:
      "Claim remains available once the conditions are met.",
    claimNotAvailableTitle: "Not available yet",
    claimAvailableTitle: "Claim available",
    sellAvailableTitle: "Sell available",
    sellDisabledTitle: "Sell still disabled on-chain",

    legacyWalletDetected:
      "Legacy wallet detected: BuyerState exists, BuyerStateExtV2 is still missing.",
    conservativeDisplayNotice:
      "This display is based conservatively on on-chain BuyerState, BuyerStateExtV2 and VaultConfigV2. The blockchain remains authoritative.",
    onchainLive: "ON-CHAIN VERIFIED",
    onchainBlocked: "ON-CHAIN BLOCKED",

    buyCountLegendZero: "0 Buys",
    buyCountLegendLow: "1–4",
    buyCountLegendMid: "5–9",
    buyCountLegendLimit: "10 = Daily Limit",

    // Forum / Leaderboard / Airdrop
    communityForum: "Community Forum",
    forumBackendDisabled:
      "The forum is intentionally disabled in write mode without a backend.\nReason: No local LocalStorage fallback in the production investor flow.",
    topDmdHolder: "Top DMD Holders",
    protocolOwnerAirdrop: "Protocol Owner – Smart Airdrop Preview",
    ownerOnlyArea:
      "Only the current Protocol Owner can view this area.",

    // Public notices
    founderOwnerFeedsHidden:
      "Founder/owner-specific feeds are intentionally not part of the public investor flow.",
    onchainSourceNotice:
      "On-chain state is the source of truth. The app shows a conservative public surface.",

    // Runtime / actions
    walletConnectAlert: "Connect wallet.",
    autoWhitelistInProgress: "Auto whitelist…",
    buyInProgress: "Buy…",
    claimInProgress: "Claim…",
    v2InitInProgress: "Initializing BuyerStateExtV2…",

    whitelistSent: "Whitelist sent:",
    buySent: "Buy sent:",
    claimSent: "Claim sent:",
    v2StatusInitialized: "V2 status initialized:",
    v2StatusInitializedSuffix:
      "Please retry claim / trading afterwards.",
    v2StatusInitializedClaimRetry:
      "Please press claim again now.",

    // Validation / flow messages
    autoWhitelistRequiresMinBuy:
      "Auto whitelist requires an intended buy of at least {min} SOL.",
    buyRangeError: "Buy range: {min} to {max} SOL.",
    walletNotApproved: "Wallet is not approved.",
    noBuyerState: "No BuyerState found.",
    invalidDmdAmount: "Please enter a valid DMD amount.",
    legacyWalletInitFirst:
      "Legacy wallet detected. Please initialize BuyerStateExtV2 first.",
    legacyWalletClaimInitFirst:
      "Legacy wallet detected. Initializing BuyerStateExtV2 first…",
    claimUnavailablePrefix: "Claim not available - ",
    sellFoundationPhaseBlocked:
      "Sell is not available yet during the controlled treasury phase.",

    // Sell flow explanation
    sellPublicClientNotice:
      "DMD is intentionally operating in a controlled treasury phase. The public investor client does not execute the DMD→SOL path directly at the moment because the current on-chain sell route is treasury-signer bound. The app shows the real status, but does not pretend to offer a public DEX sell flow.",

    // Error prefixes
    whitelistErrorPrefix: "Whitelist error: ",
    buyErrorPrefix: "Buy error: ",
    claimErrorPrefix: "Claim error: ",
    sellHintPrefix: "Sell notice: ",
    v2InitErrorPrefix: "V2 init error: ",

    // Normalized runtime errors
    sellDisabledFrontend:
      "DMD→SOL is currently intentionally disabled in the public investor frontend.",
    buyCooldownActive:
      "Buy cooldown is active. Please wait until the cooldown has expired.",
    buyDailyLimitExceeded:
      "Daily limit reached. Additional buys are temporarily blocked.",
    legacyClaimFlowDisabled:
      "Only Claim V2 is active. Please verify the app version.",
    sellTemporarilyDisabled:
      "Sell is currently disabled during the controlled treasury phase.",
    invalidTreasury:
      "Treasury configuration does not match the on-chain truth.",
    invalidOwner:
      "Owner configuration does not match the on-chain truth.",
    rewardTooSmall: "Reward is currently too small to claim.",
    insufficientVaultRewardLiquidity:
      "Not enough reward liquidity in the vault.",
    insufficientTreasuryLiquidity:
      "The treasury does not currently have enough liquidity for this path.",
    extraSellApprovalRequired:
      "Additional sell approval is required.",

    // Policy / timer texts
    claimAvailableNow: "✅ Claim available",
    claimAvailableIn: "⏳ Claim in {time}",
    sellWindowResetPending: "Reset due / next window active",
  },
} as const;