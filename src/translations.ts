export type Lang = "de" | "en";

export const translations = {
  de: {
    // General
    dashboard: "Dashboard",
    trading: "Trading",
    forum: "Forum",
    leaderboard: "Leaderboard",
    airdrop: "Airdrop",
    walletConnect: "Wallet verbinden",
    walletConnectHint:
      "Verbinde deine Wallet über den Button unten, um DMD sicher zu nutzen.",
    status: "Status",
    hint: "Hinweis",
    protocolNotice: "Protocol Notice",

    // Dashboard
    vaultOwnerMatch: "Vault Owner Match",
    treasuryMatch: "Treasury Match",
    sellStatus: "Sell Status",
    pricingMode: "Pricing Mode",
    program: "Programm",
    mint: "Mint",
    dmdPriceDex: "DMD Preis (DEX)",
    dmdAppValue: "DMD App Wert",
    solPriceUsd: "SOL Preis (USD)",
    live: "LIVE",
    blocked: "BLOCKED",
    unknown: "UNKNOWN",
    dynamic: "Dynamisch",
    manual: "Manuell",

    // Trading
    walletOverview: "Wallet Übersicht",
    yourDmd: "Dein DMD",
    dmdMarketDex: "DMD Market (DEX)",
    yourDmdDexValue: "Wert deiner DMD (DEX)",
    claimCounter: "Claim Counter",
    buyCountToday: "Käufe heute",
    buyCooldown: "Buy Cooldown",
    sellCountWindow: "Sell Count Window",
    freeSellsInWindow: "Freie Sells im Fenster",
    extraSellApprovals: "Extra Sell Freigaben",
    sellWindowReset: "Sell Window Reset",
    treasurySol: "Treasury (SOL)",
    vaultDmd: "Vault (DMD)",
    sellRoute: "Sell Route",
    free: "frei",
    resetUtc: "Reset täglich um 00:00 UTC",

    tradingNotice: "Trading Hinweis",
    sellOnchainLive: "Sell / DMD→SOL ist on-chain freigegeben.",
    sellOnchainBlocked: "Sell / DMD→SOL ist on-chain aktuell blockiert.",
    investorClientNotice:
      "Die Investor App zeigt den echten On-chain-Status an. Der öffentliche Sell-Pfad wird im Investor-Client derzeit bewusst nicht direkt ausgeführt. Buy und Claim bleiben der sichere Standardpfad.",

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
    sellOnchainStillBlocked: "Sell bleibt on-chain aktuell blockiert.",
    claimRemainsAvailable:
      "Claim bleibt verfügbar, sobald die Bedingungen erfüllt sind.",

    legacyWalletDetected:
      "Legacy-Wallet erkannt: BuyerState vorhanden, BuyerStateExtV2 fehlt noch.",
    conservativeDisplayNotice:
      "Die Anzeige basiert konservativ auf On-chain BuyerState, BuyerStateExtV2 und VaultConfigV2. Maßgeblich bleibt die Blockchain.",
    onchainLive: "ON-CHAIN LIVE",
    onchainBlocked: "ON-CHAIN BLOCKED",

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
  },

  en: {
    // General
    dashboard: "Dashboard",
    trading: "Trading",
    forum: "Forum",
    leaderboard: "Leaderboard",
    airdrop: "Airdrop",
    walletConnect: "Connect Wallet",
    walletConnectHint:
      "Connect your wallet using the button below to use DMD securely.",
    status: "Status",
    hint: "Notice",
    protocolNotice: "Protocol Notice",

    // Dashboard
    vaultOwnerMatch: "Vault Owner Match",
    treasuryMatch: "Treasury Match",
    sellStatus: "Sell Status",
    pricingMode: "Pricing Mode",
    program: "Program",
    mint: "Mint",
    dmdPriceDex: "DMD Price (DEX)",
    dmdAppValue: "DMD App Value",
    solPriceUsd: "SOL Price (USD)",
    live: "LIVE",
    blocked: "BLOCKED",
    unknown: "UNKNOWN",
    dynamic: "Dynamic",
    manual: "Manual",

    // Trading
    walletOverview: "Wallet Overview",
    yourDmd: "Your DMD",
    dmdMarketDex: "DMD Market (DEX)",
    yourDmdDexValue: "Value of your DMD (DEX)",
    claimCounter: "Claim Counter",
    buyCountToday: "Buys Today",
    buyCooldown: "Buy Cooldown",
    sellCountWindow: "Sell Count Window",
    freeSellsInWindow: "Free Sells In Window",
    extraSellApprovals: "Extra Sell Approvals",
    sellWindowReset: "Sell Window Reset",
    treasurySol: "Treasury (SOL)",
    vaultDmd: "Vault (DMD)",
    sellRoute: "Sell Route",
    free: "free",
    resetUtc: "Resets daily at 00:00 UTC",

    tradingNotice: "Trading Notice",
    sellOnchainLive: "Sell / DMD→SOL is enabled on-chain.",
    sellOnchainBlocked: "Sell / DMD→SOL is currently blocked on-chain.",
    investorClientNotice:
      "The Investor App shows the real on-chain status. The public sell path is intentionally not executed directly in the investor client at this time. Buy and claim remain the safe standard path.",

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
    sellOnchainStillBlocked: "Sell remains blocked on-chain.",
    claimRemainsAvailable:
      "Claim remains available once the conditions are met.",

    legacyWalletDetected:
      "Legacy wallet detected: BuyerState exists, BuyerStateExtV2 is still missing.",
    conservativeDisplayNotice:
      "This display is based conservatively on on-chain BuyerState, BuyerStateExtV2 and VaultConfigV2. The blockchain remains authoritative.",
    onchainLive: "ON-CHAIN LIVE",
    onchainBlocked: "ON-CHAIN BLOCKED",

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
  },
} as const;
