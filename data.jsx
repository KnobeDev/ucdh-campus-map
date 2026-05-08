// Campus data — auto-rescaled from PNG (1212x1084) to SVG (919x792) viewport.
// All x/y/w/h are in SVG-viewport pixel space. Fine-tune via edit mode.

const MAP_IMG = { w: 919, h: 792, src: "campus-map.svg" };

const BUILDINGS = [
  // ============ NORTH-WEST CLUSTER ============
  // Cypress Building (yellow K) — top
  { code: "K",  name: "Cypress Building",                 cat: "admin",     x: 131.3, y: 74.0, w: 35.2,  h: 28.3, label: "Cypress" },
  // Medical Records (yellow N, small block north of Cypress)
  { code: "N",  name: "Medical Records",                  cat: "admin",     x: 182.0, y: 75.2, w: 21.9,  h: 38.7, label: "Medical Records" },
  // Patient Support Services Building (yellow, between Cypress and Med Center)
  { code: "PS", name: "Patient Support Services Building",cat: "admin",     x: 197.3, y: 86.2, w: 64.5,  h: 35.8, label: "Patient Support" },
  // P1 staff parking (beige)
  { code: "P1", name: "Parking 1 (staff only)",           cat: "parking",   x: 198.9, y: 117.8, w: 36.6,  h: 35.8, label: "P1" },

  // ============ MEDICAL CENTER CORE ============
  { code: "T",  name: "Medical Center",                   cat: "hospital",  x: 210.1, y: 150.9, w: 170.1, h: 107.2, label: "Medical Center" },
  // California Tower attached to right of Med Center
  { code: "U",  name: "California Tower",                 cat: "hospital",  x: 374.8, y: 176.2, w: 55.0,  h: 68.5, label: "Cal Tower" },
  // Pathology Building (small navy block north of Med Center)
  { code: "I",  name: "Pathology Building",               cat: "research",  x: 418.0, y: 232.2, w: 44.0,  h: 33.5, label: "Pathology" },
  // North Addition (W) — small navy block
  { code: "W",  name: "North Addition",                   cat: "hospital",  x: 283.4, y: 120.6, w: 47.7,  h: 29.7, label: "North Addition" },

  // ============ EAST OF MEDICAL CENTER ============
  // Cancer Center North (cyan)
  { code: "M",  name: "Comprehensive Cancer Center North",cat: "clinic",    x: 630.0, y: 348.7, w: 46.9,  h: 30.6, label: "Cancer N" },
  // Cancer Center South (cyan, just below)
  { code: "L",  name: "Comprehensive Cancer Center South",cat: "clinic",    x: 425.6, y: 320.0, w: 52.0,  h: 29.7, label: "Cancer S" },
  // P5 (dark gray, contractor) — between Cancer & 48X
  { code: "P5", name: "Parking 5 (contractor only)",      cat: "parking",   x: 514.6, y: 205.4, w: 77.0, h: 37.2, label: "P5" },
  // P4 (bright green parking lot) + 48X Complex share rectangle (P4 top, 48X bottom)
  { code: "P4", name: "Parking 4",                        cat: "parking",   x: 592.4, y: 217.1, w: 80.6, h: 26.1, label: "P4" },
  { code: "A",  name: "48X Complex",                      cat: "clinic",    x: 582.1, y: 242.3, w: 80.6, h: 26.8, label: "48X Complex" },

  // ============ FAR-WEST CLUSTER ============
  // Behavioral Health Center (cyan, far left)
  { code: "Y",  name: "Behavioral Health Center",         cat: "clinic",    x: 59.0,  y: 148.9, w: 65.9,  h: 26.1, label: "Behavioral Health" },
  // Children's Behavioral Health (cyan, below)
  { code: "Z",  name: "Children's Behavioral Health",     cat: "clinic",    x: 88.5, y: 176.1, w: 69.6,  h: 37.2, label: "Children's BH" },
  // Hotel Med Park (yellow-orange, mid-left)
  { code: "Hp", name: "Hotel Med Park",                   cat: "external",  x: 164.3, y: 265.6, w: 58.7,  h: 26.1, label: "Hotel Med Park" },
  // Sherman Building (small)
  { code: "Sh", name: "Sherman Building",                 cat: "admin",     x: 154.0, y: 229.5, w: 55.0,  h: 23.8, label: "Sherman" },
  // Davis I & II
  { code: "D1", name: "Davis I Building",                 cat: "admin",     x: 179.3, y: 290.1, w: 58.7,  h: 22.3, label: "Davis I" },
  { code: "D2", name: "Davis II Building",                cat: "admin",     x: 193.3, y: 312.1, w: 58.7,  h: 22.3, label: "Davis II" },
  // Western Fairs Building
  { code: "WF", name: "Western Fairs Building",           cat: "admin",     x: 194.2, y: 332.6, w: 58.7,  h: 26.1, label: "Western Fairs" },
  // Ticon I (small bldg between Western Fairs and main)
  { code: "T1", name: "ABMCO",                            cat: "admin",     x: 238.1, y: 356.2, w: 36.6,  h: 22.3, label: "ABMCO" },
  { code: "SFC",name: "Student Fitness Center",           cat: "amenity",   x: 253,   y: 380,   w: 36,    h: 18,   label: "Student Fitness Center" },
  // Ticon II (top-far-left)
  { code: "T2", name: "Ticon II",                         cat: "admin",     x: 234.4,  y: 356.2,  w: 44.0,  h: 22.3, label: "Ticon II" },

  // ============ MEDICAL CENTER NORTH (small bldgs above Med Ctr) ============
  // Gratitude Garden (small, NW of Med Ctr)
  { code: "GG", name: "Gratitude Garden",                 cat: "amenity",   x: 251.7, y: 104.7, w: 40.3,  h: 16.4, label: "Gratitude Garden" },
  // Police (small, between Cypress and Pathology)
  { code: "PO", name: "Police / Public Safety",           cat: "admin",     x: 284.8, y: 107.5, w: 26.4,  h: 28.3, label: "Police" },

  // ============ P3 PARKING (green, hospital main) ============
  { code: "P3", name: "Parking 3 (hospital main)",        cat: "parking",   x: 236.1, y: 197.6, w: 52.0,  h: 59.6, label: "P3" },

  // ============ CENTER-EAST: Shriners + courtyard area ============
  // Shriners Hospital (gray)
  { code: "SH", name: "Shriners Hospital",                cat: "external",  x: 314.7, y: 313.8, w: 58.7,  h: 59.6, label: "Shriners Hospital" },
  // Shriners Parking Garage (gray)
  { code: "SPG",name: "Shriners Parking Garage",          cat: "external",  x: 380.6, y: 313.8, w: 44.0,  h: 59.6, label: "Shriners Parking" },
  // Courtyard by Marriott (gray)
  { code: "CM", name: "Courtyard by Marriott",            cat: "external",  x: 334.7, y: 364.7, w: 73.3, h: 37.2, label: "Courtyard Marriott" },
  // Glassrock (yellow, mid)
  { code: "V",  name: "Glassrock Building",               cat: "admin",     x: 298.8, y: 375.5, w: 37.4,  h: 24.6, label: "Glassrock" },
  // Cancer Survivor Park (small light-green, mid)
  { code: "CSP",name: "Cancer Survivor Park",             cat: "amenity",   x: 316.9, y: 416.4, w: 73.3, h: 37.2, label: "Cancer Survivor Park" },
  // Oak Park Research (yellow X)
  { code: "X",  name: "Oak Park Research Building",       cat: "research",  x: 277.4, y: 465.3, w: 32.3,  h: 32.0, label: "Oak Park Research" },

  // ============ CENTER: Education / Vanderhoef / Research ============
  // Center for Health and Technology (orange G — large block)
  { code: "G",  name: "Center for Health and Technology", cat: "education", x: 453.5, y: 282.9, w: 70.4,  h: 45.4, label: "Center Health & Tech" },
  // Education Building / Medical Library (orange E)
  { code: "E",  name: "Education Building / Medical Library",cat: "education",x: 546.2, y: 355.0, w: 44.0, h: 44.6, label: "Education" },
  // Administrative Support Building (yellow B) — large
  { code: "B",  name: "Administrative Support Building",  cat: "admin",     x: 512.8, y: 282.8, w: 82.1, h: 60.3, label: "Admin Support" },
  // Vanderhoef Commons (dark green — outdoor fitness court)
  { code: "VC", name: "Vanderhoef Commons",               cat: "amenity",   x: 485.3, y: 346.4, w: 37.4,  h: 49.9, label: "Vanderhoef" },
  // Betty Irene Moore Hall (yellow D, below Vanderhoef)
  { code: "D",  name: "Betty Irene Moore Hall",           cat: "education", x: 519.6, y: 374.3, w: 55.0,  h: 37.2, label: "Betty Irene Moore" },
  // Imaging Research Center (small mid)
  { code: "J",  name: "Imaging Research Center",          cat: "research",  x: 534.3, y: 252.5, w: 25.6,  h: 22.3, label: "Imaging Research" },
  // Research 1, 2, 3 (cluster)
  { code: "O",  name: "Research 1",                       cat: "research",  x: 363.7, y: 410.6, w: 44.0,  h: 23.8, label: "R1" },
  { code: "Pb", name: "Research 2",                       cat: "research",  x: 367.6, y: 439.0, w: 44.0,  h: 23.8, label: "R2" },
  { code: "Pc", name: "Research 3",                       cat: "research",  x: 363.5, y: 468.6, w: 44.0,  h: 22.3, label: "R3" },

  // ============ ACC + EYE INSTITUTE ============
  // Lawrence J. Ellison ACC (cyan)
  { code: "K2", name: "Lawrence J. Ellison Ambulatory Care Center", cat: "clinic", x: 619.0, y: 349.6, w: 52.0, h: 90.8, label: "ACC" },
  // Eye Institute (cyan, north of ACC)
  { code: "EI", name: "Ernest E. Tschannen Eye Institute",cat: "clinic",    x: 617.5, y: 303.4, w: 95.3, h: 33.5, label: "Eye Institute" },
  // Same Day Surgery Center (small cyan AA)
  { code: "AA", name: "Same Day Surgery Center",          cat: "clinic",    x: 671.2, y: 438.4, w: 30.7,  h: 25.3, label: "Same Day Surgery" },
  // P2 (vertical green parking column right of ACC)
  { code: "P2", name: "Parking 2",                        cat: "parking",   x: 674.3, y: 355.2, w: 35.2,  h: 76.7, label: "P2" },

  // ============ CENTRAL PLANT / FACILITIES (mid-east) ============
  { code: "S",  name: "Facilities Support Services",      cat: "admin",     x: 500.2, y: 488.6, w: 46.9,  h: 37.2, label: "Facilities" },
  { code: "CP", name: "Central Plant",                    cat: "admin",     x: 566.4, y: 469.5, w: 82.1, h: 60.3, label: "Central Plant" }, // utility building — not walkable

  // ============ AGGIE SQUARE AREA ============
  // Aggie Square — split into 5 sub-buildings. C is the original parent code; the
  // remaining four use working names (AS2-AS5) and can be renamed via Edit Mode once
  // the SVG-labeled tenants are confirmed.
  { code: "C",   name: "Aggie Square",                    cat: "admin",     x: 304.8, y: 416.4, w: 128.3, h: 96.8, label: "Aggie Sq" },
  { code: "AS2", name: "Aggie Square - Lab East",         cat: "research",  x: 432,   y: 480,   w: 36,    h: 24,   label: "Lab East" },
  { code: "AS3", name: "Aggie Square - Building 3",       cat: "admin",     x: 400,   y: 460,   w: 36,    h: 28,   label: "AS3" },
  { code: "AS4", name: "Aggie Square - Building 4",       cat: "admin",     x: 400,   y: 510,   w: 36,    h: 28,   label: "AS4" },
  { code: "AS5", name: "Aggie Square - Building 5",       cat: "admin",     x: 440,   y: 510,   w: 36,    h: 28,   label: "AS5" },
  // Aggie Square Parking (green block)
  { code: "P6", name: "Aggie Square Parking",             cat: "parking",   x: 439.3, y: 527.5, w: 154.7, h: 40.2, label: "P6" },

  // ============ FAR-EAST: MIND, P7, Ronald McDonald, Kiwanis ============
  // MIND Institute (cyan, far right)
  { code: "V2", name: "MIND Institute",                   cat: "clinic",    x: 785.2,y: 511.0, w: 46.9,  h: 49.9, label: "MIND Institute" },
  // MIND Lab (small near MIND Institute)
  { code: "ML", name: "MIND Lab",                         cat: "research",  x: 745.6, y: 500.1, w: 21.9,  h: 23.8, label: "MIND Lab" },
  // P7 (beige staff parking)
  { code: "P7", name: "Parking 7 (staff only)",           cat: "parking",   x: 853.6,y: 502.3, w: 38.9,  h: 77.4, label: "P7" },
  // Ronald McDonald House (gray Z, far right)
  { code: "RM", name: "Ronald McDonald House",            cat: "external",  x: 738.8,y: 395.1, w: 65.9,  h: 55.8, label: "Ronald McDonald" },
  // Kiwanis Family House (small, far right)
  { code: "KF", name: "Kiwanis Family House",             cat: "external",  x: 794.6,y: 600.6, w: 58.7,  h: 26.1, label: "Kiwanis Family" },

  // ============ SOUTH BUILDINGS ============
  // Institute for Regenerative Cures / CTSC (yellow Q)
  { code: "Q",  name: "Institute for Regenerative Cures / CTSC", cat: "research", x: 398.0, y: 600.0, w: 77.7, h: 48.4, label: "Inst. Regen Cures" },
  // UC Davis Rehabilitation Hospital (navy BB) — south
  { code: "BB", name: "UC Davis Rehabilitation Hospital", cat: "hospital",  x: 512.5, y: 651.9, w: 55.7,  h: 42.4, label: "Rehab Hospital" },
  // Language Academy of Sacramento (gray, south-mid)
  { code: "LA", name: "Language Academy of Sacramento",   cat: "external",  x: 519.6, y: 569.4, w: 73.3, h: 37.2, label: "Language Academy" },
  // California Department of Justice (gray, south-east, large)
  { code: "DOJ",name: "California Department of Justice", cat: "external",  x: 598.4, y: 589.4, w: 146.7, h: 104.2, label: "Dept. of Justice" },
  // Sacramento Employment Development (small, far-south-east)
  { code: "SED",name: "Sacramento Employment Development Office", cat: "external", x: 799.1, y: 634.8, w: 73.3, h: 44.6, label: "Sac Employment Dev" },
  // Broadway Building (yellow F, bottom-right)
  { code: "F",  name: "Broadway Building",                cat: "admin",     x: 715.4, y: 730.1, w: 81.4, h: 28.3, label: "Broadway Building" },

  // ============ MISC ============
  // Water Tower
  { code: "WT", name: "Water Tower",                      cat: "admin",     x: 460.3, y: 181.2, w: 25.6,  h: 29.7, label: "Water Tower" },
];

const PARKING_BUILDING_CODES = new Set(BUILDINGS.filter(b => b.cat === "parking").map(p => p.code));

// Categories (used for color, filter, legend)
const CATEGORIES = {
  hospital:  { label: "Hospital",          color: "#003A70" },
  clinic:    { label: "Clinic / Health",   color: "#00A6CE" },
  research:  { label: "Research",          color: "#7E388C" },
  education: { label: "Education",         color: "#E37222" },
  admin:     { label: "Administrative",    color: "#9C8A4D" },
  amenity:   { label: "Amenity / Common",  color: "#5DA831" },
  external:  { label: "Non-UC Davis",      color: "#727272" },
};

// Parking sub-types
const PARKING_TYPES = {
  staff:   { label: "Staff only",          color: "#C8B27A" },
  patient: { label: "Patient & Visitor",   color: "#1ba0d3" },
};

// Departments / clinics — point users to a building
const DEPARTMENTS = [
  { name: "Emergency Department",          building: "T",  note: "24/7" },
  { name: "Cardiology",                    building: "K2" },
  { name: "Oncology / Cancer Care",        building: "M" },
  { name: "Radiation Oncology",            building: "L" },
  { name: "Ophthalmology",                 building: "EI" },
  { name: "Pediatrics",                    building: "T" },
  { name: "Children's Behavioral Health",  building: "Z" },
  { name: "MIND Institute (Autism, ND)",   building: "V2" },
  { name: "Behavioral Health",             building: "Y" },
  { name: "Rehabilitation",                building: "BB" },
  { name: "Imaging / Radiology",           building: "J" },
  { name: "Pathology Lab",                 building: "I" },
  { name: "Pharmacy (Main)",               building: "T" },
  { name: "Same Day Surgery",              building: "AA" },
  { name: "Medical Records",               building: "N" },
  { name: "Medical Library",               building: "E" },
  { name: "Nursing School",                building: "D" },
  { name: "Information Desk",              building: "T" },
  { name: "Information Desk (ACC)",        building: "K2" },
  { name: "Cafeteria / Eateries",          building: "T" },
  { name: "Police / Public Safety",        building: "PO" },
  { name: "Outpatient Clinic",             building: "K2" },
  { name: "Primary Care",                  building: "K2" },
  { name: "Neurology",                     building: "K2" },
  { name: "Surgery (Inpatient)",           building: "T" },
  { name: "Center for Health & Technology",building: "G" },
  { name: "Regenerative Medicine",         building: "Q" },
];

// Walking-graph nodes — placed along visible streets in the PNG
// Streets: Stockton Blvd (diagonal NW→SE), 2nd Ave, 3rd Ave, Y St, X St, Broadway, 45th, 48th, 49th, 50th
const GRAPH_NODES = {
  // Stockton Blvd (diagonal)
  "stk_top":   { x: 176.9, y: 72.0 },
  "stk_mid":   { x: 235.5, y: 280.3 },
  "stk_low":   { x: 330.8, y: 593.0 },
  "stk_bot":   { x: 404.1, y: 704.7 },
  // X Street (~y=380, mid-east)
  "x_45":      { x: 367.5, y: 284.1 },
  "x_st":      { x: 558.1, y: 284.1 },
  "x_49":      { x: 715.8, y: 284.1 },
  "x_50":      { x: 800.1,y: 284.1 },
  // Y Street (~y=505)
  "y_45":      { x: 294.2, y: 377.1 },
  "y_st":      { x: 558.1, y: 373.4 },
  "y_49":      { x: 715.8, y: 373.4 },
  // 2nd Ave (~y=550, runs through Aggie Sq)
  "a2_st":     { x: 558.1, y: 410.6 },
  "a2_49":     { x: 715.8, y: 410.6 },
  // 3rd Ave (~y=755)
  "a3_st":     { x: 514.1, y: 563.2 },
  "a3_49":     { x: 715.8, y: 563.2 },
  "a3_50":     { x: 836.7,y: 563.2 },
  // Broadway (~y=970)
  "bw_st":     { x: 514.1, y: 719.5 },
  "bw_49":     { x: 715.8, y: 719.5 },
  // Internal building access nodes (snap-points near building entrances)
  "n_med":     { x: 335.2, y: 217.0 }, // Medical Center main entrance
  "n_cancer":  { x: 481.1, y: 235.7 }, // Cancer Center
  "n_acc":     { x: 644.6, y: 395.7 }, // ACC main
  "n_eye":     { x: 665.1, y: 319.8 }, // Eye Institute
  "n_mind":    { x: 816.9,y: 546.8 }, // MIND
  "n_aggie":   { x: 372.6, y: 477.7 }, // Aggie Square
  "n_aggiep":  { x: 516.3, y: 548.4 }, // Aggie Sq Parking
  "n_p3":      { x: 274.4, y: 248.3 }, // P3
  "n_p2":      { x: 698.2, y: 403.2 }, // P2
  "n_p4":      { x: 640.3, y: 239.5 }, // P4
  "n_p7":      { x: 876.3,y: 555.8 }, // P7
  "n_p6":      { x: 516.3, y: 548.4 }, // P6 same as aggiep
  "n_p1":      { x: 228.2, y: 146.3 }, // P1
  "n_p5":      { x: 558.1, y: 231.9 }, // P5
  "n_rehab":   { x: 560.3, y: 663.7 }, // Rehab BB
  "n_irc":     { x: 441.6, y: 636.2 }, // Inst Regen Cures
  "n_brdwy":   { x: 759.0, y: 747.0 },// Broadway Building
  "n_addmin":  { x: 637.3, y: 511.1 }, // Admin Support
  "n_chc":     { x: 484.1, y: 328.7 }, // CHT
  "n_edu":     { x: 564.0, y: 383.8 }, // Education
};

// Graph edges (bidirectional) — connect nodes that share streets / are walkable neighbors
const GRAPH_EDGES = [
  // Stockton chain
  ["stk_top","stk_mid"], ["stk_mid","stk_low"], ["stk_low","stk_bot"],
  // X Street
  ["x_45","x_st"], ["x_st","x_49"], ["x_49","x_50"],
  // Y Street
  ["y_45","y_st"], ["y_st","y_49"],
  // 2nd Ave
  ["a2_st","a2_49"],
  // 3rd Ave
  ["a3_st","a3_49"], ["a3_49","a3_50"],
  // Broadway
  ["bw_st","bw_49"],
  // 45th north-south — direct x_45↔y_45 removed (cuts through Shriners)
  ["y_45","stk_low"],
  // Stockton St vertical (45th continuation)
  ["stk_mid","x_45"],
  // ~Stockton Blvd / 45th going through
  ["x_st","y_st"], ["y_st","a2_st"], ["a2_st","a3_st"], ["a3_st","bw_st"],
  ["x_49","y_49"], ["y_49","a2_49"], ["a2_49","a3_49"], ["a3_49","bw_49"],
  // Connect building entrances to nearest graph node
  ["n_med","stk_mid"], ["n_med","x_45"], ["n_med","x_st"],
  ["n_cancer","x_st"], ["n_cancer","x_45"],
  ["n_acc","y_st"], ["n_acc","y_49"],
  ["n_eye","x_st"], ["n_eye","y_st"], ["n_eye","x_49"],
  ["n_mind","a3_49"], ["n_mind","a3_50"],
  ["n_aggie","y_st"], ["n_aggie","a2_st"], ["n_aggie","y_45"],
  ["n_aggiep","a2_st"], ["n_aggiep","a3_st"],
  ["n_p3","x_45"], ["n_p3","stk_mid"],
  ["n_p2","y_49"], ["n_p2","a2_49"],
  ["n_p4","x_49"], ["n_p4","x_st"],
  ["n_p7","a3_50"],
  ["n_p1","stk_top"], ["n_p1","stk_mid"],
  ["n_p5","x_st"], ["n_p5","x_49"],
  ["n_rehab","a3_st"], ["n_rehab","bw_st"],
  ["n_irc","stk_low"], ["n_irc","a3_st"],
  ["n_brdwy","bw_49"], ["n_brdwy","a3_50"],
  ["n_addmin","a2_49"], ["n_addmin","a3_49"],
  ["n_chc","y_st"], ["n_chc","x_st"],
  ["n_edu","y_st"], ["n_edu","a2_st"],
];

// Each building "owns" a graph entrance node so routing can find a start/end
const BUILDING_ENTRY = {
  T:"n_med", G:"n_chc", U:"n_med", I:"n_med", W:"n_med", N:"n_p1",
  M:"n_cancer", L:"n_cancer", A:"n_p4",
  K:"n_p1", Y:"stk_top", Z:"stk_top", Hp:"stk_mid", Sh:"stk_mid",
  D1:"stk_mid", D2:"stk_mid", WF:"stk_mid", T1:"stk_mid", T2:"stk_top",
  GG:"n_med", PO:"n_med",
  SH:"y_45", SPG:"y_45", CM:"y_45", V:"y_45", CSP:"y_45", X:"y_45",
  E:"n_edu", B:"n_addmin", VC:"n_edu", D:"n_edu", J:"n_chc",
  O:"n_aggie", Pb:"n_aggie", Pc:"n_aggie",
  K2:"n_acc", EI:"n_eye", AA:"n_acc",
  S:"n_addmin", CP:"n_addmin",
  C:"n_aggie", AS2:"n_aggie", AS3:"n_aggie", AS4:"n_aggie", AS5:"n_aggie", SFC:"stk_mid",
  V2:"n_mind", ML:"n_mind", RM:"a2_49", KF:"a3_50",
  Q:"n_irc", BB:"n_rehab", LA:"a3_st", DOJ:"a3_49", SED:"a3_50", F:"n_brdwy",
  WT:"x_st",
  // Parking entries
  P1:"n_p1", P2:"n_p2", P3:"n_p3", P4:"n_p4", P5:"n_p5", P6:"n_p6", P7:"n_p7",
};

// Shuttle stops (approximate, from VP/EP markers along Stockton)
const SHUTTLE_STOPS = [
  { id: "sh_acc",     name: "ACC / Eye Institute",     x: 616.8, y: 347.4 },
  { id: "sh_med",     name: "Medical Center Main",     x: 330.8, y: 224.5 },
  { id: "sh_cancer",  name: "Cancer Center",           x: 481.1, y: 280.3 },
  { id: "sh_aggie",   name: "Aggie Square",            x: 374.8, y: 518.5 },
  { id: "sh_mind",    name: "MIND Institute",          x: 774.4,y: 563.2 },
  { id: "sh_rehab",   name: "Rehab Hospital",          x: 558.1, y: 682.3 },
];

window.MAP_IMG = MAP_IMG;
window.BUILDINGS = BUILDINGS;
window.PARKING_BUILDING_CODES = PARKING_BUILDING_CODES;
window.CATEGORIES = CATEGORIES;
window.PARKING_TYPES = PARKING_TYPES;
window.DEPARTMENTS = DEPARTMENTS;
window.GRAPH_NODES = GRAPH_NODES;
window.GRAPH_EDGES = GRAPH_EDGES;
window.BUILDING_ENTRY = BUILDING_ENTRY;
window.SHUTTLE_STOPS = SHUTTLE_STOPS;

// SacRT public-transit bus stops near the Sacramento campus (approximate positions)
const BUS_STOPS = [
  { id: "bus_stk_x",      name: "Stockton Blvd & X St (SacRT)",    x: 215.0, y: 291.5 },
  { id: "bus_stk_y",      name: "Stockton Blvd & Y St (SacRT)",    x: 215.0, y: 373.4 },
  { id: "bus_bw_49",      name: "Broadway & 49th St (SacRT)",      x: 693.1, y: 706.2 },
  { id: "bus_xst_47",     name: "X St & 47th St (SacRT)",          x: 565.4, y: 289.3 },
];
window.BUS_STOPS = BUS_STOPS;
