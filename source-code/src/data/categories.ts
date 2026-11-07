/**
 * Spending/income categories, two levels: a parent group (Food & dining, Transport…) and a
 * specific category (Restaurants, Food delivery…). Wealthica's own "Category" is the account
 * kind, so everything is categorised from the transaction description:
 *
 *   1. your rules (Settings / the review list) — always win
 *   2. the built-in merchant dictionary — the LONGEST matching keyword wins ("UBER EATS" > "UBER")
 *   3. payment-processor prefixes (TST* → restaurant, DD * → DoorDash, IC* → Instacart…)
 *   4. shape fallbacks: e-Transfers in/out, bill payments, card payments, in-store / online purchases
 *   5. "Uncategorised" only when nothing at all fits
 *
 * Category kinds: "income", "expense" (counts as spending), "transfer" (money moved, not spent:
 * credit-card payments, transfers to your own investment accounts).
 */

export type CategoryKind = "income" | "expense" | "transfer";

export interface Category {
  id: string;
  label: string;
  /** Kept as "group" for compatibility: income / expense / transfer. */
  group: CategoryKind;
  parent: string;
}

export interface Parent {
  id: string;
  label: string;
  kind: CategoryKind;
}

export const PARENTS: Parent[] = [
  { id: "income", label: "Income", kind: "income" },
  { id: "food", label: "Food & dining", kind: "expense" },
  { id: "shopping", label: "Shopping", kind: "expense" },
  { id: "transport", label: "Transport & car", kind: "expense" },
  { id: "housing", label: "Housing", kind: "expense" },
  { id: "bills", label: "Bills & utilities", kind: "expense" },
  { id: "health", label: "Health & wellness", kind: "expense" },
  { id: "digital", label: "Subscriptions & digital", kind: "expense" },
  { id: "leisure", label: "Entertainment & leisure", kind: "expense" },
  { id: "travel", label: "Travel", kind: "expense" },
  { id: "education", label: "Education", kind: "expense" },
  { id: "family", label: "Family, pets & giving", kind: "expense" },
  { id: "financial", label: "Fees, interest & insurance", kind: "expense" },
  { id: "money-out", label: "Cash & e-Transfers out", kind: "expense" },
  { id: "unknown", label: "Other purchases", kind: "expense" },
  { id: "transfers", label: "Transfers & card payments", kind: "transfer" },
];

const c = (id: string, label: string, parent: string): Category => ({ id, label, parent, group: PARENTS.find((p) => p.id === parent)!.kind });

export const CATEGORIES: Category[] = [
  c("salary", "Salary & payroll", "income"),
  c("gov", "Government benefits & tax refunds", "income"),
  c("side-income", "Side income (Uber, DoorDash…)", "income"),
  c("interac-in", "Interac e-Transfers in", "income"),
  c("interest-income", "Interest earned", "income"),
  c("other-income", "Other income", "income"),

  c("groceries", "Groceries", "food"),
  c("groceries-online", "Online groceries", "food"),
  c("restaurants", "Restaurants", "food"),
  c("fast-food", "Fast food", "food"),
  c("coffee", "Coffee & bakeries", "food"),
  c("food-delivery", "Food delivery", "food"),
  c("alcohol", "Alcohol & cannabis", "food"),

  c("clothing", "Clothing & shoes", "shopping"),
  c("electronics", "Electronics", "shopping"),
  c("home-goods", "Home & hardware", "shopping"),
  c("general-shopping", "Department & discount stores", "shopping"),
  c("online-shopping", "Online shopping", "shopping"),
  c("beauty", "Beauty & personal care", "shopping"),
  c("books-hobbies", "Books, hobbies & sports gear", "shopping"),
  c("refunds", "Refunds & returns", "shopping"),

  c("fuel", "Fuel & EV charging", "transport"),
  c("transit", "Public transit", "transport"),
  c("rideshare", "Rideshare & taxi", "transport"),
  c("parking", "Parking & tolls", "transport"),
  c("car-payment", "Car loan / lease", "transport"),
  c("car-maintenance", "Car maintenance & wash", "transport"),
  c("car-other", "Licence, registration & tickets", "transport"),

  c("rent", "Rent", "housing"),
  c("mortgage", "Mortgage", "housing"),
  c("property-tax", "Property tax & condo fees", "housing"),
  c("furniture", "Furniture & home services", "housing"),

  c("utilities", "Hydro, gas & water", "bills"),
  c("phone-internet", "Phone & internet", "bills"),
  c("bill-payments", "Other bill payments", "bills"),

  c("pharmacy", "Pharmacy", "health"),
  c("medical", "Medical, dental & vision", "health"),
  c("fitness", "Gym & fitness", "health"),

  c("streaming", "Streaming & music", "digital"),
  c("software", "Software, apps & cloud", "digital"),
  c("memberships", "Memberships & news", "digital"),

  c("events", "Movies, events & attractions", "leisure"),
  c("games", "Games", "leisure"),
  c("bars", "Bars & nightlife", "leisure"),

  c("flights", "Flights", "travel"),
  c("hotels", "Hotels & stays", "travel"),
  c("travel-other", "Car rental, trains & other travel", "travel"),

  c("tuition", "Tuition & courses", "education"),

  c("childcare", "Childcare & kids", "family"),
  c("pets", "Pets", "family"),
  c("gifts-donations", "Gifts & donations", "family"),

  c("bank-fees", "Bank & card fees", "financial"),
  c("interest-charges", "Interest charges", "financial"),
  c("insurance", "Insurance", "financial"),
  c("taxes", "Taxes & government", "financial"),
  c("professional", "Professional services", "financial"),

  c("cash", "Cash withdrawals", "money-out"),
  c("interac-out", "Interac e-Transfers out", "money-out"),

  c("in-store", "In-store purchases (unidentified)", "unknown"),
  c("online-purchase", "Online purchases (unidentified)", "unknown"),
  c("uncategorised", "Uncategorised", "unknown"),

  c("card-payment", "Credit-card payments", "transfers"),
  c("investment-transfer", "Transfers to investments", "transfers"),
  c("own-transfer", "Transfers between your accounts", "transfers"),
  c("circle-transfer", "Transfers within your circle", "transfers"),
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((x) => [x.id, x]));
export const PARENT_BY_ID = new Map(PARENTS.map((p) => [p.id, p]));
export const parentOf = (categoryId: string | undefined) => PARENT_BY_ID.get(CATEGORY_BY_ID.get(categoryId ?? "")?.parent ?? "unknown")!;

/** Category ids from earlier versions, so existing rules keep working. */
export const LEGACY_IDS: Record<string, string> = {
  dining: "restaurants",
  transport: "transit",
  housing: "rent",
  telecom: "phone-internet",
  fees: "bank-fees",
  "e-transfer": "interac-out",
  gifts: "gifts-donations",
  shopping: "general-shopping",
  health: "pharmacy",
  subscriptions: "streaming",
  entertainment: "events",
  travel: "travel-other",
  education: "tuition",
};
export const resolveCategory = (id: string) => LEGACY_IDS[id] ?? id;

export interface Rule {
  /** Case-insensitive keyword (matched at a word start), or a regex written as /…/ */
  match: string;
  category: string;
  /** Only apply to inflows (+) or outflows (−). */
  direction?: "in" | "out";
}

// ── Built-in dictionary ───────────────────────────────────────────────────────
// Canadian-focused merchants and billers. Keywords match at a word start, case-insensitively.

const D: [category: string, direction: Rule["direction"], words: string][] = [
  // Income
  ["salary", "in", "PAYROLL|PAY DEPOSIT|PAYROLL DEPOSIT|DIRECT DEP|DIRECT DEPOSIT|SALARY|DEPOT DIRECT|PAIE|WAGES|PAYCHEQUE|PAY CHEQUE"],
  ["side-income", "in", "MISC. PAYMENT UBER|MISC PAYMENT UBER|UBER CANADA|UBER BV|UBER PAYMENTS|UBER PAYOUT|UBER EATS PAYOUT|MISC. PAYMENT DOORDASH|MISC PAYMENT DOORDASH|DOORDASH|SKIPTHEDISHES|SKIP THE DISHES|INSTACART SHOPPER|INSTACART|LYFT|FANTUAN|PAYOUT"],
  ["gov", "in", "PROVINCIAL PAYMENT|FEDERAL PAYMENT|PAYMENT CANADA|GST CANADA|GST|GOVERNMENT OF CANADA|GOV'T CANADA|CANADA FED|FED GOVT|PROV GOVT|GST/HST|GST CREDIT|GSTHST|CCB|CANADA CHILD|CAN TAX|CANADA RA|CRA REFUND|TAX REFUND|INCOME TAX REFUND|EI CANADA|EMPLOYMENT INSURANCE|CPP|OAS|ONTARIO TRILLIUM|ONTARIO-TRILLIUM|OTB|CLIMATE ACTION|CAI PAYMENT|CARBON REBATE|ONTARIO SALES TAX|ONT TRILLIUM"],
  ["interest-income", "in", "INTEREST PAID|INTEREST CREDIT|INT CREDIT|DEPOSIT INTEREST|INTEREST EARNED|BONUS INTEREST"],
  ["interac-in", "in", "E-TRANSFER|E-TRF|E TRANSFER|INTERAC E-TRANSFER|INTERAC E-TRF|AUTODEPOSIT|AUTO DEPOSIT|RECEIVE E-TFR|E-TFR RECEIVED|ETRANSFER"],

  // Food
  ["groceries", "out", "LOBLAWS|LOBLAW|NO FRILLS|NOFRILLS|SOBEYS|METRO|FOOD BASICS|FRESHCO|SAFEWAY|REAL CANADIAN SUPERSTORE|SUPERSTORE|ATLANTIC SUPERSTORE|ZEHRS|FORTINOS|VALU-MART|VALUMART|YOUR INDEPENDENT GROCER|INDEPENDENT GROCER|T&T|T & T|FARM BOY|LONGOS|LONGO'S|ADONIS|IGA|MAXI|PROVIGO|FOODLAND|COSTCO WHOLESALE|COSTCO|WALMART SUPERCENTER|WAL-MART SUPERCENTER|GIANT TIGER|WHOLE FOODS|SAVE ON FOODS|SAVE-ON-FOODS|COOP|CO-OP|NATIONS FRESH|NATION'S FRESH|H MART|HMART|GALLERIA|PAT CENTRAL|BULK BARN|SUMMERHILL MARKET|PUSATERI|HIGHLAND FARMS|BIG BEAR|FOOD MARKET|SUPERMARKET|GROCERY|GROCERIES|FRESH MARKET|ASIAN MARKET|HALAL MEAT|BUTCHER|PRODUCE|SUPERMARCHE|EPICERIE|AL PREMIUM|SUNNY FOOD|PANCHVATI|CHALO FRESHCO"],
  ["groceries-online", "out", "INSTACART|IC*|PC EXPRESS|PCEXPRESS|VOILA|GROCERY GATEWAY|SPUD|INABUGGY|CRAVE MARKET|WALMART GROCERY"],
  ["food-delivery", "out", "DOORDASH|DD *|DD*|UBER EATS|UBEREATS|UBER *EATS|UBER* EATS|SKIP THE DISHES|SKIPTHEDISHES|SKIP*|FANTUAN|RITUAL|HELLOFRESH|HELLO FRESH|CHEFS PLATE|GOODFOOD"],
  ["coffee", "out", "TIM HORTONS|TIMHORTONS|TIMS|STARBUCKS|SECOND CUP|BALZAC|COFFEE|CAFE|CAFÉ|ESPRESSO|DAVIDSTEA|DAVIDS TEA|BAKERY|BOULANGERIE|PATISSERIE|DONUT|DOUGHNUT|COBS BREAD|COBS|BUBBLE TEA|CHATIME|COCO FRESH|GONG CHA|SHARETEA|PRESOTEA|CHA TIME|REAL FRUIT BUBBLE"],
  ["fast-food", "out", "MCDONALD|MC DONALD|BURGER KING|WENDY|A&W|A & W|HARVEY|KFC|POPEYES|SUBWAY|TACO BELL|DAIRY QUEEN|DQ |PIZZA PIZZA|PIZZA HUT|DOMINO|LITTLE CAESARS|PIZZA NOVA|PANAGO|241 PIZZA|FIREHOUSE SUBS|QUIZNOS|MARY BROWN|CHICK-FIL-A|CHICK FIL A|FIVE GUYS|FRESHII|BARBURRITO|CHIPOTLE|MUCHO BURRITO|BURRITO BOYZ|OSMOWS|OSMOW|PITA PIT|PITA LAND|THAI EXPRESS|MANCHU WOK|NEW YORK FRIES|SMOKE'S POUTINERIE|SMOKES POUTINE|JOLLIBEE|MR SUB|MR. SUB|COUSINS SUB|ST-HUBERT EXPRESS|SHAWARMA|PIZZA|BURGER|FRIES|WINGS|HAKKA|BIRYANI EXPRESS|TACO|SUSHI SHOP|SUSHISHOP|NANDO"],
  ["restaurants", "out", "TST*|TST *|RESTAURANT|RESTO|BISTRO|GRILL|KITCHEN|STEAKHOUSE|STEAK HOUSE|SUSHI|RAMEN|PHO |DIM SUM|BRASSERIE|TRATTORIA|PIZZERIA|TAVERN|EATERY|DINER|BBQ|BARBECUE|CURRY|TANDOORI|BIRYANI|DHABA|MASALA|THALI|SWEETS|THE KEG|KEG STEAK|EARLS|CACTUS CLUB|JACK ASTOR|MONTANA|EAST SIDE MARIO|BOSTON PIZZA|SWISS CHALET|KELSEY|MILESTONES|THE OLD SPAGHETTI|SPAGHETTI FACTORY|SCORES|ST-HUBERT|DENNY|IHOP|SUNSET GRILL|COUNTRY STYLE|CHUCK E|RED LOBSTER|OLIVE GARDEN|MANDARIN|CHURRASCO|PAI |GUU|KINKA|JOEY|MOXIES|BAR BURRITO|HOT POT|HOTPOT|KOREAN BBQ|BUFFET|MEZZE|SHAWARMA PALACE|CANTINA"],
  ["alcohol", "out", "LCBO|BEER STORE|THE BEER STORE|WINE RACK|WINERACK|SAQ|BC LIQUOR|LIQUOR|WINE SHOP|BREWERY|OCS|ONTARIO CANNABIS|CANNABIS|DISPENSARY|SPIRITLEAF|FIRE & FLOWER|HIGH TIDE|CANNA CABANA|TOKYO SMOKE|VAPE"],

  // Shopping
  ["clothing", "out", "H&M|H & M|ZARA|UNIQLO|GAP|OLD NAVY|BANANA REPUBLIC|AMERICAN EAGLE|AERIE|ABERCROMBIE|HOLLISTER|ARITZIA|LULULEMON|ROOTS|SPORT CHEK|SPORTCHEK|SPORT CHECK|NIKE|ADIDAS|PUMA|NEW BALANCE|FOOT LOCKER|FOOTLOCKER|SKECHERS|ALDO|CALL IT SPRING|SIMONS|LE CHATEAU|RW&CO|RW & CO|SUZY SHIER|GARAGE|DYNAMITE|FORTY SEVEN|BOSTON PIZZA CLOTHING|MARK'S|MARKS WORK|PARTY CITY COSTUME|SAIL|ATMOSPHERE|THE NORTH FACE|ARC'TERYX|ARCTERYX|COLUMBIA|PATAGONIA|LEVI|GUESS|TOMMY HILFIGER|CALVIN KLEIN|HUGO BOSS|INDOCHINO|MOORES|HARRY ROSEN|SEPHORA CLOTHING|SHEIN|SSENSE|ZALANDO|PLATO'S CLOSET|VALUE VILLAGE|SAVERS|THRIFT|CLOTHING|APPAREL|FASHION|BOUTIQUE|SHOES|SHOE"],
  ["electronics", "out", "BEST BUY|BESTBUY|CANADA COMPUTERS|MEMORY EXPRESS|THE SOURCE|APPLE STORE|APPLE.COM/CA|SAMSUNG|MICROSOFT STORE|NEWEGG|STAPLES|VISIONS ELECTRONICS|LONDON DRUGS|B&H PHOTO|DELL|LENOVO|HP STORE|ELECTRONICS|GAMESTOP|EB GAMES"],
  ["home-goods", "out", "HOME DEPOT|HOMEDEPOT|LOWES|LOWE'S|RONA|HOME HARDWARE|CANADIAN TIRE|CDN TIRE|IKEA|HOMESENSE|HOME SENSE|BED BATH|STRUCTUBE|STRUCTUBRE|WAYFAIR|KITCHEN STUFF|LINEN CHEST|PRINCESS AUTO|TSC STORES|PEAVEY MART|HARDWARE|LUMBER|GARDEN CENTRE|GARDEN CENTER|NURSERY|SHERWIN|BENJAMIN MOORE|DULUX|THE BRICK|LEON'S|LEONS|ASHLEY"],
  ["general-shopping", "out", "WALMART|WAL-MART|DOLLARAMA|DOLLAR TREE|DOLLAR STORE|DOLLARSTORE|WINNERS|MARSHALLS|TJ MAXX|HUDSON'S BAY|HUDSONS BAY|THE BAY|HBC|COSTCO.CA|GIANT TIGER|MINISO|DAISO|PARTY CITY|MICHAELS|DOLLAR|DEPARTMENT STORE|SHOPPERS|SHOPPERSDRUGMART|SHOPPERS DRUG|REXALL GENERAL|KMART|TARGET|MALL|OUTLET|PREMIUM OUTLETS|SQUARE ONE|YORKDALE|EATON CENTRE|SCARBOROUGH TOWN|PACIFIC MALL"],
  ["online-shopping", "out", "AMAZON|AMZN|AMZ*|AMAZON.CA|AMAZON MKTP|AMZN MKTP|EBAY|ETSY|ALIEXPRESS|ALIBABA|TEMU|WISH.COM|SHOPIFY|SP *|SP*|PAYPAL *|PAYPAL*|PP*|KIJIJI|FACEBK|META PAY|WALMART.CA|BESTBUY.CA|INDIGO.CA|CANADA POST|PUROLATOR|FEDEX|UPS STORE"],
  ["beauty", "out", "SEPHORA|ULTA|BATH & BODY|BATH AND BODY|THE BODY SHOP|MAC COSMETICS|LUSH|SALON|HAIR|BARBER|BARBERSHOP|NAILS|NAIL SPA|SPA |DAY SPA|ESTHETIC|WAXING|LASER|BEAUTY|COSMETIC|GREAT CLIPS|FIRST CHOICE HAIR|DRYBAR|THREADING"],
  ["books-hobbies", "out", "INDIGO|CHAPTERS|COLES|BOOK|BOOKSTORE|LIBRARY|MICHAELS|DESERRES|CURRYS ART|LEGO|TOYS R US|MASTERMIND|HOBBY|CRAFT|MUSIC STORE|LONG & MCQUADE|LONG AND MCQUADE|GOLF TOWN|MEC|MOUNTAIN EQUIPMENT|DECATHLON|CYCLE|BIKE"],

  // Transport
  ["fuel", "out", "PETRO-CANADA|PETRO CANADA|PETROCAN|PETRO-CAN|ESSO|SHELL|HUSKY|PIONEER|ULTRAMAR|IRVING|CHEVRON|SUNOCO|MOBIL|FAS GAS|CO-OP GAS|COSTCO GAS|CANADIAN TIRE GAS|CDN TIRE GAS|GAS BAR|GASBAR|ONROUTE|ON ROUTE|MACEWEN|GAS STATION|FUEL|TESLA SUPERCHARGER|SUPERCHARGER|FLO EV|CHARGEPOINT|ELECTRIFY|IVY CHARGING|PETRO|GAS "],
  ["transit", "out", "PRESTO|TTC|GO TRANSIT|GOTRANSIT|METROLINX|UP EXPRESS|MIWAY|MI WAY|BRAMPTON TRANSIT|YRT|VIVA|DRT|OC TRANSPO|STM |EXO |TRANSLINK|COMPASS CARD|CALGARY TRANSIT|HSR|GRT|TRANSIT|COMPASS"],
  ["rideshare", "out", "UBER TRIP|UBER *TRIP|UBER* TRIP|UBER RIDES|UBER CANADA|UBER BV|LYFT|TAXI|CAB |BECK TAXI|CO-OP CAB|COOP CAB|HOPP|LIMO"],
  ["parking", "out", "PARKING|PARK |IMPARK|GREEN P|GREENP|INDIGO PARK|PRECISE PARK|HONK|PAYBYPHONE|PAY BY PHONE|SP+|SP PLUS|EASYPARK|407 ETR|407ETR|ETR 407|TOLL"],
  ["car-payment", "out", "HONDA FINANCE|HONDA FINANCIAL|TOYOTA CREDIT|TOYOTA FINANCIAL|LEXUS FINANCIAL|FORD CREDIT|HYUNDAI CAPITAL|HYUNDAI MOTOR FIN|KIA FINANCE|KIA FINANCIAL|NISSAN CANADA FIN|NISSAN FINANCE|INFINITI FINANCIAL|MAZDA CREDIT|MAZDA FINANCIAL|SUBARU FINANCIAL|BMW FINANCIAL|BMW FS|MERCEDES-BENZ FIN|MERCEDES BENZ FIN|MB FINANCIAL|VW CREDIT|VOLKSWAGEN FIN|AUDI FINANCE|GM FINANCIAL|GMAC|TESLA FINANCE|TD FINANCE|SCOTIA DEALER|RBC AUTO|BMO AUTO|CIBC AUTO|DESJARDINS AUTO|IA AUTO|CAR LOAN|AUTO LOAN|LEASE PAYMENT|VEHICLE LEASE"],
  ["car-maintenance", "out", "JIFFY LUBE|MR LUBE|MR. LUBE|MIDAS|MEINEKE|SPEEDY|KAL TIRE|OK TIRE|TIRE|TIRES|AUTO REPAIR|AUTO SERVICE|AUTOMOTIVE|COLLISION|AUTOBODY|AUTO BODY|CAR WASH|CARWASH|PETRO-CANADA CAR WASH|DETAILING|NAPA|PARTSOURCE|PART SOURCE|AUTO PARTS|CANADIAN TIRE AUTO|DEALERSHIP|HONDA OF|TOYOTA OF|SERVICEONTARIO DRIVE"],
  ["car-other", "out", "SERVICEONTARIO|SERVICE ONTARIO|SERVICE ONT|DRIVETEST|DRIVE TEST|LICENCE|LICENSE|REGISTRATION|PLATE STICKER|PARKING TICKET|PARKING VIOLATION|CITY OF TORONTO PARK|TRAFFIC FINE|CAA |CAA MEMBERSHIP"],

  // Housing
  ["rent", "out", "RENT|RENTAL PAYMENT|LANDLORD|PROPERTY MANAGEMENT|PROPERTY MGMT|APARTMENTS|APTS|RESIDENCES|TENANT|LEASE RENT|ROOMMATE|ROOM RENT|YARDI|RENTMOOLA|RENT MOOLA|RENTSYNC|PAYLEASE|CAPREIT|MINTO|TRIDEL|STARLIGHT|SKYLINE LIVING|MAINSTREET|HOMESTEAD|GREENWIN|BENTALL"],
  ["mortgage", "out", "MORTGAGE|MTG PMT|MTGE|HELOC|MORTGAGE PAYMENT|FIRST NATIONAL|MCAP|MERIX|EQUITABLE BANK|HOME TRUST|TANGERINE MTG"],
  ["property-tax", "out", "PROPERTY TAX|PROP TAX|TAXES CITY|CITY OF TORONTO TAX|TAX - CITY|CONDO FEE|CONDO FEES|MAINTENANCE FEE|STRATA|CONDOMINIUM CORP|TSCC|MTCC|YRSCC"],
  ["furniture", "out", "SLEEP COUNTRY|MATTRESS|FURNITURE|CLEANING|CLEANER|MAID|PLUMB|ELECTRICIAN|HANDYMAN|MOVING|MOVERS|U-HAUL|UHAUL|STORAGE|PUBLIC STORAGE|DYMON|LOCKSMITH|PEST CONTROL|ORKIN|TASKRABBIT"],

  // Bills
  ["utilities", "out", "HYDRO|TORONTO HYDRO|HYDRO ONE|ALECTRA|ELEXICON|HYDRO OTTAWA|LONDON HYDRO|ENOVA|BURLINGTON HYDRO|OAKVILLE HYDRO|ENBRIDGE|ENBRIDGE GAS|UNION GAS|RELIANCE|ENERCARE|DIRECT ENERGY|JUST ENERGY|SUMMITT|WATER BILL|WATER SERVICES|WATERWORKS|UTILITY|UTILITIES|FORTISBC|FORTIS|EPCOR|ATCO|ENMAX|BC HYDRO|HYDRO-QUEBEC|HYDRO QUEBEC|SASKPOWER|SASKENERGY|MANITOBA HYDRO|NB POWER|NOVA SCOTIA POWER|NEWFOUNDLAND POWER"],
  ["phone-internet", "out", "ROGERS|BELL CANADA|BELL MOBILITY|BELL MTS|BELL |TELUS|FIDO|KOODO|VIRGIN MOBILE|VIRGIN PLUS|FREEDOM MOBILE|CHATR|PUBLIC MOBILE|LUCKY MOBILE|SHAW|VIDEOTRON|COGECO|EASTLINK|TEKSAVVY|START.CA|DISTRIBUTEL|ORIGIN INTERNET|EBOX|OXIO|VMEDIA|SASKTEL|STARLINK|INTERNET|WIRELESS|MOBILITY|TELECOM"],
  ["bill-payments", "out", "BILL PAYMENT|BILL PMT|BILLPAY|BILL PAY|PAYMENT TO|PRE-AUTHORIZED|PREAUTHORIZED|PAD |PRE AUTH"],

  // Health
  ["pharmacy", "out", "PHARMACY|PHARMA|PHARMASAVE|REXALL|SHOPPERS DRUG MART|SHOPPERS DRUG|SDM|GUARDIAN|IDA PHARMACY|JEAN COUTU|UNIPRIX|FAMILIPRIX|LONDON DRUGS|DRUG MART|DRUGSTORE|MEDICINE SHOPPE|WELL.CA|COSTCO PHARMACY|WALMART PHARMACY|LOBLAW PHARMACY|NO FRILLS PHARMACY"],
  ["medical", "out", "DENTAL|DENTIST|DENTISTRY|ORTHODONT|CLINIC|MEDICAL|MEDICENTRE|PHYSIO|PHYSIOTHERAPY|CHIRO|CHIROPRACT|MASSAGE|RMT|OPTOMETR|OPTICAL|EYE CARE|EYECARE|SPECSAVERS|FYI DOCTORS|LENSCRAFTERS|HAKIM|CLEARLY|CONTACT LENS|LIFELABS|DYNACARE|HOSPITAL|PSYCHOLOG|THERAP|COUNSELL|NATUROPATH|ACUPUNCT|MEDICAL IMAGING|X-RAY|ULTRASOUND|WALK-IN|WALK IN|TELEHEALTH|MAPLE.CA|DIALOGUE|TELUS HEALTH"],
  ["fitness", "out", "GOODLIFE|GOOD LIFE|FIT4LESS|FIT 4 LESS|PLANET FITNESS|ANYTIME FITNESS|LA FITNESS|EQUINOX|YMCA|YWCA|ORANGETHEORY|F45|CROSSFIT|BARRY'S|SOULCYCLE|YOGA|PILATES|CLIMBING|BOULDER|GYM|FITNESS|ATHLETIC CLUB|CLASSPASS|STRAVA|PELOTON|COMMUNITY CENTRE|RECREATION|REC CENTRE|SWIM"],

  // Digital
  ["streaming", "out", "NETFLIX|SPOTIFY|DISNEY PLUS|DISNEY+|DISNEYPLUS|CRAVE|CRAVETV|PRIME VIDEO|AMAZON PRIME|AMZN PRIME|PRIMEVIDEO|APPLE TV|APPLE MUSIC|YOUTUBE PREMIUM|YOUTUBE|GOOGLE *YOUTUBE|DAZN|PARAMOUNT|PARAMOUNT+|HBO|MAX.COM|HULU|BRITBOX|TUBI|CRUNCHYROLL|AUDIBLE|SIRIUSXM|SIRIUS XM|TIDAL|DEEZER|TWITCH|PATREON|ONLYFANS|SLING|HOTSTAR|ZEE5|SONYLIV|SONY LIV|JIOCINEMA|ALTBALAJI|EROS NOW"],
  ["software", "out", "APPLE.COM/BILL|APPLE.COM|ITUNES|ICLOUD|GOOGLE *|GOOGLE STORAGE|GOOGLE ONE|GOOGLE PLAY|GOOGLE CLOUD|GOOGLE WORKSPACE|GSUITE|MICROSOFT|MSFT|MS *|OFFICE 365|XBOX LIVE|ADOBE|DROPBOX|NOTION|SLACK|ZOOM.US|ZOOM VIDEO|CANVA|GRAMMARLY|1PASSWORD|LASTPASS|BITWARDEN|NORDVPN|EXPRESSVPN|PROTON|GITHUB|OPENAI|CHATGPT|ANTHROPIC|CLAUDE.AI|MIDJOURNEY|JETBRAINS|AWS|AMAZON WEB SERVICES|DIGITALOCEAN|CLOUDFLARE|GODADDY|NAMECHEAP|SQUARESPACE|WIX|SHOPIFY*|DUOLINGO|HEADSPACE|CALM|TRUECALLER|LINKEDIN|TINDER|BUMBLE|HINGE|APP STORE"],
  ["memberships", "out", "COSTCO MEMBERSHIP|COSTCO MEMBER|AMAZON PRIME MEMBERSHIP|PC OPTIMUM|CAA MEMBERSHIP|MEMBERSHIP|MEMBER FEE|NEWS|GLOBE AND MAIL|GLOBEANDMAIL|TORONTO STAR|NATIONAL POST|NEW YORK TIMES|NYTIMES|MEDIUM.COM|SUBSTACK|ECONOMIST|THE ATHLETIC|WSJ"],

  // Leisure
  ["events", "out", "CINEPLEX|LANDMARK CINEMAS|IMAX|MOVIE|THEATRE|THEATER|TICKETMASTER|LIVE NATION|STUBHUB|EVENTBRITE|SEATGEEK|ROGERS CENTRE|SCOTIABANK ARENA|BUDWEISER STAGE|MUSEUM|GALLERY|ZOO|AQUARIUM|RIPLEY|CN TOWER|CANADA'S WONDERLAND|WONDERLAND|SCIENCE CENTRE|BOWLING|ESCAPE ROOM|ARCADE|PLAYDIUM|DAVE & BUSTER|DAVE AND BUSTER|GOLF|SKI |SKI RESORT|BLUE MOUNTAIN|SKATING|CONCERT|FESTIVAL|EXHIBITION|PARKS CANADA|ONTARIO PARKS|CONSERVATION"],
  ["games", "out", "STEAM|STEAMGAMES|VALVE|PLAYSTATION|PSN|SONY INTERACTIVE|XBOX|NINTENDO|EPIC GAMES|RIOT GAMES|BLIZZARD|ACTIVISION|EA *|ELECTRONIC ARTS|UBISOFT|ROBLOX|GOOGLE *GAME|SUPERCELL|KING.COM|GAMESTOP"],
  ["bars", "out", "BAR |PUB|TAVERN|LOUNGE|NIGHTCLUB|CLUB |BREWPUB|ALE HOUSE|ALEHOUSE|SPORTS BAR|WINE BAR|COCKTAIL|SHOT BAR|HOOKAH|SHISHA"],

  // Travel
  ["flights", "out", "AIR CANADA|AIRCANADA|WESTJET|PORTER|FLAIR|SWOOP|LYNX AIR|AIR TRANSAT|SUNWING|UNITED AIR|AMERICAN AIR|DELTA AIR|ALASKA AIR|JETBLUE|SOUTHWEST|AIR INDIA|EMIRATES|QATAR|ETIHAD|LUFTHANSA|BRITISH AIRWAYS|KLM|AIR FRANCE|TURKISH AIR|CATHAY|SINGAPORE AIR|ANA |JAL |INDIGO AIR|INDIGO 6E|VISTARA|SPICEJET|AKASA|FLIGHT|AIRLINE|AIRWAYS|AIRPORT|GTAA|YYZ|YUL|YVR|PEARSON"],
  ["hotels", "out", "HOTEL|MOTEL|INN |RESORT|AIRBNB|VRBO|BOOKING.COM|EXPEDIA HOTEL|HOTELS.COM|MARRIOTT|HILTON|HYATT|SHERATON|WESTIN|FAIRMONT|HOLIDAY INN|BEST WESTERN|DELTA HOTELS|COURTYARD|HAMPTON INN|RAMADA|DAYS INN|COMFORT INN|QUALITY INN|SUPER 8|TRAVELODGE|NOVOTEL|IBIS|ACCOR|HOSTEL|LODGE|COTTAGE|CHALET"],
  ["travel-other", "out", "EXPEDIA|KAYAK|SKYSCANNER|TRIP.COM|PRICELINE|HOPPER|FLIGHTHUB|REDTAG|RED TAG|ITRAVEL|VIA RAIL|VIARAIL|AMTRAK|MEGABUS|FLIXBUS|GREYHOUND|ROVER|ENTERPRISE RENT|ENTERPRISE|HERTZ|AVIS|BUDGET RENT|NATIONAL CAR|ALAMO|DOLLAR RENT|THRIFTY|TURO|COMMUNAUTO|ZIPCAR|EVO CAR|DUTY FREE|TRAVEL INSURANCE|PASSPORT|IRCC|VISA FEE|EMBASSY|CONSULATE|VFS|BLS INTERNATIONAL|FOREX|CURRENCY EXCHANGE"],

  // Education
  ["tuition", "out", "UNIVERSITY|UNIV |COLLEGE|SCHOOL|TUITION|ACADEMY|INSTITUTE|SENECA|HUMBER|CENTENNIAL|GEORGE BROWN|SHERIDAN|YORK UNIV|UOFT|UNIVERSITY OF TORONTO|TMU|RYERSON|MCMASTER|WESTERN UNIV|QUEEN'S|UOTTAWA|CARLETON|OSAP|UDEMY|COURSERA|EDX|SKILLSHARE|MASTERCLASS|LINKEDIN LEARNING|PLURALSIGHT|DATACAMP|BRILLIANT|KHAN ACADEMY|KUMON|SYLVAN|TUTOR|EXAM|IELTS|TOEFL|GMAT|PEARSON VUE|PROMETRIC|CPA ONTARIO|CFA INSTITUTE"],

  // Family
  ["childcare", "out", "DAYCARE|DAY CARE|CHILDCARE|CHILD CARE|MONTESSORI|NANNY|BABYSIT|KIDS|BABIES R US|CARTER|OSHKOSH|THE CHILDREN'S PLACE|CHILDRENS PLACE|TOYS|SUMMER CAMP|DAY CAMP"],
  ["pets", "out", "PETSMART|PET SMART|PET VALU|PETVALU|PETLAND|GLOBAL PET|PET SUPPLIES|VET |VETERINARY|ANIMAL HOSPITAL|PET HOSPITAL|BANFIELD|CHEWY|ROVER.COM|DOG |CAT |GROOMING|KENNEL"],
  ["gifts-donations", "out", "DONATION|DONATE|CHARITY|CANADAHELPS|CANADA HELPS|GOFUNDME|UNICEF|RED CROSS|SALVATION ARMY|UNITED WAY|SICKKIDS|SICK KIDS|CANCER SOCIETY|HEART & STROKE|WORLD VISION|PLAN CANADA|DOCTORS WITHOUT|MSF|OXFAM|FOOD BANK|DAILY BREAD|TEMPLE|GURDWARA|MANDIR|MOSQUE|MASJID|CHURCH|PARISH|ISKCON|GIFT|FLOWERS|FLORIST|1-800-FLOWERS|HALLMARK|CARLTON CARDS|GREETING"],

  // Financial
  ["bank-fees", "out", "SERVICE CHARGE|MONTHLY FEE|MONTHLY ACCOUNT FEE|ACCOUNT FEE|PLAN FEE|MONTHLY PLAN|OVERDRAFT|OD FEE|NSF|NON-SUFFICIENT|ANNUAL FEE|CARD FEE|FX FEE|FOREIGN TRANSACTION FEE|ATM FEE|ABM FEE|INTERAC FEE|E-TRANSFER FEE|WIRE FEE|STOP PAYMENT|CHEQUE ORDER|CHEQUE BOOK|SAFETY DEPOSIT|BALANCE TRANSFER FEE|CASH ADVANCE FEE|OVERLIMIT|OVER LIMIT|LATE FEE|RETURNED PAYMENT|FEE"],
  ["interest-charges", "out", "INTEREST CHARGE|INTEREST CHARGES|PURCHASE INTEREST|CASH ADVANCE INTEREST|CASH INTEREST|INTEREST - PURCHASES|INTEREST ON|OVERDRAFT INTEREST|LOC INTEREST|LINE OF CREDIT INTEREST|INTEREST"],
  ["insurance", "out", "INSURANCE|INS PREM|INS. PREM|ASSURANCE|INTACT|AVIVA|DESJARDINS INS|DESJARDINS GENERAL|TD INSURANCE|TD INS|TD MELOCHE|BELAIR|BELAIRDIRECT|SONNET|ECONOMICAL|WAWANESA|CAA INSURANCE|SQUARE ONE|APOLLO|ALLSTATE|PEMBRIDGE|ROYAL & SUN|RSA CANADA|JEVCO|CUMIS|SUN LIFE INS|MANULIFE|CANADA LIFE|GREAT-WEST|GREAT WEST LIFE|INDUSTRIAL ALLIANCE|IA FINANCIAL|EMPIRE LIFE|RBC INSURANCE|BMO INSURANCE|POLICYME|PERSONAL INSURANCE|THE PERSONAL|ONLIA|DUUO|LEMONADE|DOGGONE|TRUPANION|PETSECURE|BLUE CROSS"],
  ["taxes", "out", "CANADA REVENUE|CRA PAYMENT|REVENUE CANADA|RECEIVER GENERAL|TAX PAYMENT|INCOME TAX|GST PAYMENT|HST PAYMENT|CITY OF|TOWN OF|MUNICIPALITY|REGION OF|PROVINCE OF|MINISTRY OF|GOVERNMENT|GOVT|SERVICE CANADA|PASSPORT CANADA"],
  ["professional", "out", "LAWYER|LAW OFFICE|LEGAL|NOTARY|ACCOUNTANT|ACCOUNTING|CPA |H&R BLOCK|H & R BLOCK|TURBOTAX|WEALTHSIMPLE TAX|UFILE|STUDIOTAX|CONSULTING|CONSULTANT|IMMIGRATION|TRANSLATION|PRINTING|STAPLES PRINT|FEDEX OFFICE|NOTARIZE|COMMISSIONER OF OATHS"],

  // Money out
  ["cash", "out", "ATM|ABM|CASH WITHDRAWAL|WITHDRAWAL - ATM|INTERAC ATM|CASH ADVANCE|CASHBACK|CASH BACK"],
  ["interac-out", "out", "E-TRANSFER|E-TRF|E TRANSFER|INTERAC E-TRANSFER|INTERAC E-TRF|SEND E-TFR|E-TFR SENT|ETRANSFER|INTERAC SENT"],

  // Transfers (money moved, not spent)
  ["card-payment", undefined, "CIBC MASTERCARD|SCOTIA MASTERCARD|SCOTIABANK MASTERCARD|RBC MASTERCARD|TD MASTERCARD|CIBC CARD|PAYMENT CIBC|PAYMENT FROM|PAYMENT THANK YOU|PAYMENT - THANK YOU|PAYMENT RECEIVED|THANK YOU PAYMENT|CREDIT CARD PAYMENT|CARD PAYMENT|VISA PAYMENT|MASTERCARD PAYMENT|MC PAYMENT|AMEX PAYMENT|AMERICAN EXPRESS PAYMENT|SCOTIA VISA|SCOTIABANK VISA|SCOTIA MC|CIBC VISA|CIBC MC|RBC VISA|RBC MC|TD VISA|BMO MC|BMO MASTERCARD|TANGERINE MC|TRIANGLE MC|ROGERS MC|PC MASTERCARD|PC FINANCIAL MC|CAPITAL ONE|NEO FINANCIAL|BRIM|HOME TRUST VISA|WALMART MC|WEALTHSIMPLE CREDIT|AUTOPAY"],
  ["investment-transfer", undefined, "WEALTHSIMPLE|WS INVEST|QUESTRADE|QTRADE|DIRECT INVESTING|WEBBROKER|INVESTORLINE|IMPERIAL INVESTOR|SCOTIA ITRADE|ITRADE|DISNAT|NATIONAL BANK DIRECT|INTERACTIVE BROKERS|IBKR|SUN LIFE|SUNLIFE|TFSA CONTRIBUTION|RRSP CONTRIBUTION|FHSA CONTRIBUTION|MUTUAL FUND|INVESTMENT|INVEST |CONTRIBUTION"],
  ["own-transfer", undefined, "TRANSFER TO|TRANSFER FROM|TFR TO|TFR FROM|TFR-TO|TFR-FR|ONLINE TRANSFER|ONLINE BANKING TRANSFER|INTERNET TRANSFER|MOBILE TRANSFER|BETWEEN ACCOUNTS|OWN ACCOUNT|TRSF|TRANSFER"],
];

export const DEFAULT_RULES: Rule[] = [
  ...D.flatMap(([category, direction, words]) =>
    // No trimming: a trailing space is deliberate ("BELL " must not match "BELLA").
    words.split("|").filter(Boolean).map((match) => ({ match, category, direction })),
  ),
  // Card credits "… PAY. FROM - <account>" / "PAYMENT FROM -" are payments from a bank account.
  { match: "/\\bFROM -/", category: "card-payment", direction: "in" },
  { match: "/\\bPAY\\.? FROM\\b/", category: "card-payment", direction: "in" },
];

// ── Matching ──────────────────────────────────────────────────────────────────

const normalise = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();

const keywordCache = new Map<string, RegExp>();
function keywordRegex(word: string): RegExp {
  let re = keywordCache.get(word);
  if (!re) {
    // Must start at a word start ("RENT" ≠ "CURRENT"); a prefix is fine ("PHARMA" → "PHARMACY").
    re = new RegExp(`(?<![A-Z0-9])${word.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    keywordCache.set(word, re);
  }
  return re;
}

/** Length of the matched text, or 0. Regex rules (/…/) count as very specific. */
function matchLength(rule: Rule, text: string): number {
  if (rule.match.length > 2 && rule.match.startsWith("/") && rule.match.endsWith("/")) {
    try {
      return new RegExp(rule.match.slice(1, -1), "i").test(text) ? 1000 : 0;
    } catch {
      return 0;
    }
  }
  return keywordRegex(rule.match).test(text) ? rule.match.length : 0;
}

function best(rules: Rule[], text: string, direction: "in" | "out"): Rule | undefined {
  let found: Rule | undefined;
  let len = 0;
  for (const r of rules) {
    if (r.direction && r.direction !== direction) continue;
    const l = matchLength(r, text);
    if (l > len) {
      len = l;
      found = r;
    }
  }
  return found;
}

/** Shape-based fallbacks when no merchant keyword matches. */
function fallback(text: string, amount: number, accountType: string): string {
  const isCard = accountType === "credit";
  if (amount >= 0) return isCard ? "refunds" : "other-income";
  // Card purchases with a store-looking description (city/province, store number, phone) → in-store.
  if (/\.COM\b|\bWWW\.|\bONLINE\b|\bHTTPS?\b|\*/.test(text)) return "online-purchase";
  if (isCard || /\b(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE)\b|#\s?\d+|\d{3}-\d{3}-\d{4}|\bPOS\b|\bPURCHASE\b|\bDEBIT\b/.test(text)) return "in-store";
  return "uncategorised";
}

/**
 * Category for a household inflow/outflow. Your rules win; then the longest built-in keyword;
 * then shape fallbacks. Unknown categories in old rules are mapped to their new ids.
 */
export function categorise(description: string, amount: number, accountType: string, userRules: Rule[] = []): string {
  const text = normalise(description);
  const direction = amount >= 0 ? "in" : "out";
  const mine = best(userRules, text, direction);
  if (mine) return resolveCategory(mine.category);
  // Money back from a known merchant (a return) keeps that merchant's category so it nets off
  // the spending there; direction-less matching finds the merchant for positive amounts too.
  if (direction === "in" && accountType === "credit") {
    const merchant = best(DEFAULT_RULES.filter((r) => r.direction !== "in"), text, "out");
    const spend = merchant && CATEGORY_BY_ID.get(merchant.category)?.group === "expense" ? merchant.category : undefined;
    const builtInIn = best(DEFAULT_RULES, text, "in");
    // Only payments/transfers win here — a DoorDash credit on a card is a refund, not side income.
    if (builtInIn && CATEGORY_BY_ID.get(builtInIn.category)?.group === "transfer") return builtInIn.category;
    if (spend) return spend;
  }
  const builtIn = best(DEFAULT_RULES, text, direction);
  if (builtIn) return builtIn.category;
  return fallback(text, amount, accountType);
}
