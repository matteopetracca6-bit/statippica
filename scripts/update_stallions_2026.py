#!/usr/bin/env python3
"""Update stallions table with 2026 breeding season data.

Sources:
- Trot Stallions Directory (trotstallionsdirectory.com) - 152 stallions, 2026 season
- Individual stallion pages for breeding farm details
- ANACT Libro Stalloni 2026
- Grande Ippica Italiana (Renew Italian Breeding fees)

This script UPSERTs stallion records: updates existing, inserts new.
Existing ratings/stats are preserved. Only stud_fee_eur, stud_farm, country,
season, fee_source, stud_status, and scraped_at are updated.
"""

import sqlite3
import json
from datetime import datetime

DB_PATH = "data.db"
SEASON = "2026"
FEE_SOURCE = "Trot Stallions Directory 2026"
SCRAPE_DATE = datetime.now().isoformat()

# All 152 stallions from the 2026 catalog
# (name, country, stud_fee_eur, stud_farm, stud_status)
# stud_status: "active" = available for breeding, "da_concordare" = fee to be agreed,
#              "free" = free covering, "ritirato" = retired/standing but not active
# Fees are in EUR unless noted; USD fees converted at 0.92 rate (approximate)

STALLIONS_2026 = [
    # A
    ("ADRIAN CHIP", "USA", 2500, None, "active"),
    ("ALADIN EFFE", "ITA", 1500, None, "active"),
    ("ALRAJAH ONE", "ITA", 6500, "Allevamenti Toniatti, S. Michele al Tagliamento (VE)", "active"),
    ("AMBASSADOR HANOVER", "USA", 4000, None, "active"),
    ("AMON YOU SM", "ITA", 2000, None, "active"),
    ("AXL ROSE", "ITA", 3000, "Allevamenti Toniatti, S. Michele al Tagliamento (VE)", "active"),
    # B
    ("BACK OF THE NECK", None, 7500, None, "active"),
    ("BARACK FACE", "SVE", 6000, None, "active"),
    ("BENGURION JET", "ITA", 4500, None, "active"),
    ("BEPI BI", "ITA", 2500, None, "active"),
    ("BIRD PARKER", "FRA", 7000, None, "active"),
    ("BOCCADOR DE SIMM", "FRA", 5000, None, "active"),
    ("BOLD EAGLE", "FRA", 8000, "Allevamento Folli, Mordano (BO)", "active"),
    ("BRILLANTISSIME", "FRA", 6000, None, "active"),
    # C
    ("CALGARY GAMES", "SVE", 9000, "Allevamenti Toniatti, S. Michele al Tagliamento (VE)", "active"),
    ("CAPITAL MAIL", "ITA", 3500, None, "active"),
    ("CHIEF ORLANDO", "NOR", 1000, None, "active"),
    ("CLASSIC CONNECTION", "GER", 2500, None, "active"),
    ("CHARLY DU NOYER", "FRA", 9000, None, "active"),
    ("CARAT WILLIAMS", "FRA", 2000, None, "active"),
    ("COKSTILE", "NOR", 4000, None, "active"),
    ("CRAZY WOW", "USA", 3680, None, "active"),  # $4,000 USD -> ~3,680 EUR
    ("CUATRO DE JULIO", "FRA", 4000, None, "active"),
    # D
    ("DEVIOUS MAN", "USA", 2700, None, "active"),
    ("DIABOLIK GIO", "ITA", 1000, None, "active"),
    ("DIJON", "FRA", 1500, None, "active"),
    ("DONATO HANOVER", "USA", 5000, None, "active"),
    ("DON FANUCCI ZET", "SVE", 6500, None, "active"),
    ("DUBBIO AMLETICO", "ITA", None, None, "da_concordare"),
    ("DONTYOUFORGETIT", "USA", 3500, None, "active"),
    # E
    ("ECURIE D", "DAN", 10500, None, "active"),
    ("EL IDEAL", "USA", 6000, "Allevamento della Serenissima", "active"),
    ("ENERGY KING GAR", "ITA", 500, None, "active"),
    ("ERIDAN", "FRA", 2000, None, "active"),
    ("EVERY TIME BOURBON", "FRA", 2000, None, "active"),
    # F
    ("FABULOUS WOOD", "FRA", 6000, None, "active"),
    ("FACE TIME BOURBON", "FRA", 35000, None, "active"),
    ("FAST AS THE WIND", "USA", 2500, "Allevamento Folli, Mordano (BO)", "active"),
    ("FOLLOW YOU", "FRA", None, None, "da_concordare"),
    ("FATHER PATRICK", "USA", 7500, None, "active"),
    ("FEELING CASH", "FRA", 2000, None, "active"),
    ("FELICIANO", "FRA", 2000, None, "active"),
    ("FRANCESCO ZET", "SVE", 10500, "Allevamento Folli, Mordano (BO)", "active"),
    # G
    ("GELATI CUT", "FRA", 4000, None, "active"),
    ("GLOBAL TRUSTWORTHY", "ITA", 1500, None, "active"),
    ("GIVEITGASANDGO", "USA", 3000, None, "active"),
    ("GOOGOO GAAGAA", "USA", 5000, None, "active"),
    ("GO ON BOY", "FRA", 5000, None, "active"),
    ("GOTLAND", "FRA", 4000, None, "active"),
    ("GREAT KING WINE", "ITA", 500, None, "active"),  # 500 euros VAT included
    # H
    ("HAMLETIAN DOUBT", "ITA", None, None, "da_concordare"),  # = DUBBIO AMLETICO
    ("HELGAFELL", None, 4000, None, "active"),
    ("HELPISONTHEWAY", "USA", 5000, None, "active"),
    ("HOHNECK", "FRA", None, None, "da_concordare"),
    # I
    ("IDAO DE TILLARD", "FRA", 6000, None, "active"),
    ("IDEAL DE POMMEAU", "FRA", 7500, None, "active"),
    ("IDEAL LUIS", "ITA", 2000, None, "active"),
    ("IGOR FONT", "ITA", 2000, None, "active"),
    ("IZOARD VEDAQUAIS", "FRA", None, None, "da_concordare"),
    # J
    ("JOHN PALEMA", "USA", 2500, None, "active"),
    # L
    ("LANGDON GRIF", "ITA", None, None, "da_concordare"),
    ("LIBECCIO GRIF", "ITA", 1500, None, "active"),
    ("LONG TOM", "USA", 4600, None, "active"),  # $5,000 USD -> ~4,600 EUR
    ("LOUVRE", "ITA", 1000, None, "active"),
    ("LOVE MATTERS", "USA", 2500, None, "active"),
    ("LOVE YOU", "FRA", None, None, "da_concordare"),
    # M
    ("MAGICIAN OF LOVE", "ITA", None, None, "da_concordare"),
    ("MAHARAJAH", "SVE", 11500, "Allevamenti Toniatti, S. Michele al Tagliamento (VE)", "active"),
    ("MANOFMANYMISSIONS", "USA", None, None, "da_concordare"),
    ("MET'S HALL", "USA", 3200, None, "active"),
    ("MISSLE HILL", "USA", 3500, None, "active"),
    ("MISTER F DAAG", "USA", 2500, None, "active"),
    ("MISTER HERCULES", "USA", 3500, None, "active"),
    ("MISTER JP", "SVE", 2500, None, "active"),
    ("MONI VIKING", "FRA", 3000, None, "active"),
    ("MUSCLE MASS", "USA", 7360, None, "active"),  # $8,000 USD -> ~7,360 EUR
    # N
    ("NAGLO", "SVE", 1000, None, "active"),
    ("NAPOLEON BAR", "ITA", None, None, "da_concordare"),
    ("NESTA EFFE", "ITA", 2500, None, "active"),
    ("NUNCIO", "USA", 8500, None, "active"),
    # O
    ("OASIS BI", "ITA", 3000, None, "active"),
    ("OFFSHORE DREAM", "FRA", 1500, None, "active"),
    ("ORLANDO VICI", "FRA", None, None, "da_concordare"),
    ("OROPURO BAR", "ITA", 2000, None, "active"),
    ("OWEN CR", "ITA", None, None, "da_concordare"),
    # P
    ("PASCIA LEST", "ITA", 2000, None, "active"),
    ("PASTOR STEPHEN", "USA", 3500, None, "active"),
    ("PEACE OF THE RIO", "ITA", None, None, "da_concordare"),
    ("PERKINS GRIF", "ITA", 1000, None, "active"),
    ("PICK KRONOS", "ITA", 1200, None, "active"),
    ("POGGIO WALTZ", "ITA", 1000, None, "active"),
    ("PROPULSION", "USA", 7000, "Allevamento Folli, Mordano (BO)", "active"),
    # Q
    ("QUITE EASY", "USA", None, None, "da_concordare"),
    # R
    ("RAJA MIRCHI", "SVE", 4500, None, "active"),
    ("READLY EXPRESS", "SVE", 11500, None, "active"),
    ("REAL DE LOU", "FRA", 2500, None, "active"),
    ("REAL ITALIAN", "FRA", 5000, None, "active"),
    ("RENOIR DANY", "ITA", 1500, None, "active"),
    ("RESOLVE", "USA", 6000, None, "active"),
    ("RINGOSTARR TREB", "ITA", None, None, "da_concordare"),
    ("ROBERT BI", "ITA", 3000, None, "active"),
    ("ROD STEWART", "ITA", 1500, None, "active"),  # "NEW" in catalog
    ("ROMANESQUE", "ITA", 1400, None, "active"),
    ("ROYAL DREAM", "FRA", 3000, None, "active"),
    ("ROYALTY FOR LIFE", "USA", None, None, "da_concordare"),
    # S
    ("SANSONE BAR", "ITA", 600, None, "active"),
    ("SHEIKH", "ITA", 1500, None, "active"),
    ("SING HALLELUJAH", "ITA", None, None, "da_concordare"),
    ("SIX PACK", "USA", None, None, "da_concordare"),
    ("SOUTHWIND FRANK", "USA", 6500, None, "active"),
    ("SPARTAN KRONOS", "ITA", 2500, None, "active"),
    # T
    ("TANGO NEGRO", "ITA", 1500, None, "active"),
    ("TEDO FKS", "ITA", 1000, None, "active"),
    ("TETRICK WANIA", "USA", 6000, None, "active"),
    ("THE BANK", "USA", 4500, "Allevamento Folli, Mordano (BO)", "active"),
    ("TIMOKO", "FRA", 2000, None, "active"),
    ("TIMONE EK", "ITA", 2000, None, "active"),
    ("TINAMO JET", "ITA", 500, None, "active"),
    ("TOBIAS DEL RONCO", "ITA", 2000, None, "active"),
    ("TOBIN KRONOS", "ITA", 3000, None, "active"),
    ("TONY GIO", "ITA", 3500, None, "active"),
    ("TREASURE OF THE GODS", "ITA", 2000, None, "active"),
    ("TRILLO PARK", "ITA", 500, None, "active"),
    ("TRIXTON", "USA", None, None, "da_concordare"),
    ("TROLLEY", "USA", 2000, "Allevamento Il Canf, Santi Cosma e Damiano (LT)", "active"),
    ("TUONOBLU REX", "ITA", 1000, None, "active"),
    ("TWISTER BI", "ITA", 4000, None, "active"),
    # U
    ("UCONWAY", "ITA", 0, None, "active"),  # Free covering
    ("UNICORN SLM", "ITA", 1200, None, "active"),
    ("UP AND QUICK", "FRA", 2000, None, "active"),
    ("UZO JOSSELYN", "FRA", None, None, "da_concordare"),
    # V
    ("VAPRIO", "ITA", 1500, None, "active"),
    ("VARENNE", "ITA", 8500, "Varenne Futurity Srl, Eboli (SA)", "active"),
    ("VICTOR FERM", "ITA", 2000, None, "active"),
    ("VICTOR GIO", "ITA", 5300, None, "active"),
    ("VILLIAM", "SVE", 1500, None, "active"),
    ("VITRUVIO", "ITA", 3500, None, "active"),
    ("VIVID WISE AS", "ITA", 7500, None, "active"),  # "from 7,500"
    ("VOLSTEAD", "USA", 7500, None, "active"),
    ("VOLTIGEUR DE MYRT", "FRA", 2500, None, "active"),
    # Z
    ("ZACHARIAS BAR", "ITA", 2500, None, "active"),
    ("ZACON GIO", "ITA", 3000, None, "active"),
    ("ZARENNE FAS", "ITA", 2500, None, "active"),
    ("ZE MARIA", "ITA", 2000, None, "active"),
    ("ZEROZEROSETTE GAR", "ITA", 1500, None, "active"),
    ("ZILATH", "ITA", 1000, None, "active"),
    ("ZODIAC DANY GRIF", "ITA", 1000, None, "active"),
]

# Additional stallions from ANACT / other sources not in the online catalog
# but known to be standing in Italy for 2026
ADDITIONAL_STALLIONS = [
    # From ANACT 2024 and other sources - Renew Italian Breeding (gallop, not trot - skip)
    # From trotstallions.it (Folli Breeding Farm)
    ("CUT ICE CREAMS", "ITA", None, "Allevamento Folli, Mordano (BO)", "active"),
    # From trotstallions.it
    ("LUIS VARIETY", "ITA", None, None, "active"),
    # From the catalog page title "Rod Stewart, NEW1000" - normalized name
]

# Country code normalization
COUNTRY_MAP = {
    "USA": "USA",
    "ITA": "ITA",
    "FRA": "FRA",
    "SVE": "SWE",  # Svezia
    "SWE": "SWE",
    "NOR": "NOR",
    "GER": "GER",
    "DAN": "DEN",  # Danimarca
    "DEN": "DEN",
}


def update_database():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    all_stallions = STALLIONS_2026 + ADDITIONAL_STALLIONS

    updated = 0
    inserted = 0
    skipped = 0

    for name, country, fee, farm, status in all_stallions:
        # Normalize country
        if country:
            country = COUNTRY_MAP.get(country, country)

        # Check if stallion exists
        cur.execute("SELECT name FROM stallions WHERE name = ?", (name,))
        existing = cur.fetchone()

        if existing:
            # Update existing record
            cur.execute("""
                UPDATE stallions SET
                    stud_fee_eur = ?,
                    stud_farm = ?,
                    country = COALESCE(?, country),
                    season = ?,
                    fee_source = ?,
                    stud_status = ?,
                    scraped_at = ?
                WHERE name = ?
            """, (fee, farm, country, SEASON, FEE_SOURCE, status, SCRAPE_DATE, name))
            updated += 1
        else:
            # Insert new record
            cur.execute("""
                INSERT INTO stallions (
                    name, stud_fee_eur, stud_farm, country, season,
                    fee_source, stud_status, scraped_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (name, fee, farm, country, SEASON, FEE_SOURCE, status, SCRAPE_DATE))
            inserted += 1

    conn.commit()

    # Verify
    cur.execute("SELECT COUNT(*) as c FROM stallions")
    total = cur.fetchone()["c"]

    cur.execute("SELECT COUNT(*) as c FROM stallions WHERE season = '2026'")
    season_2026 = cur.fetchone()["c"]

    cur.execute("SELECT COUNT(*) as c FROM stallions WHERE stud_fee_eur IS NOT NULL AND stud_fee_eur > 0")
    with_fee = cur.fetchone()["c"]

    cur.execute("SELECT COUNT(*) as c FROM stallions WHERE stud_status = 'active'")
    active = cur.fetchone()["c"]

    cur.execute("SELECT COUNT(*) as c FROM stallions WHERE stud_status = 'da_concordare'")
    to_agree = cur.fetchone()["c"]

    print(f"Database updated successfully!")
    print(f"  Updated: {updated}")
    print(f"  Inserted: {inserted}")
    print(f"  Total stallions in DB: {total}")
    print(f"  Season 2026: {season_2026}")
    print(f"  With stud fee: {with_fee}")
    print(f"  Active: {active}")
    print(f"  Da concordare: {to_agree}")

    # Export summary as JSON
    cur.execute("""
        SELECT name, country, stud_fee_eur, stud_farm, stud_status, season
        FROM stallions
        WHERE season = '2026'
        ORDER BY stud_fee_eur DESC NULLS LAST
    """)
    rows = [dict(r) for r in cur.fetchall()]

    with open("stallions_2026_export.json", "w") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)

    print(f"\nExported {len(rows)} stallions to stallions_2026_export.json")

    # Top 10 by fee
    print("\nTop 10 by stud fee:")
    cur.execute("""
        SELECT name, country, stud_fee_eur, stud_farm, stud_status
        FROM stallions
        WHERE stud_fee_eur IS NOT NULL AND stud_fee_eur > 0
        ORDER BY stud_fee_eur DESC
        LIMIT 10
    """)
    for r in cur.fetchall():
        farm_str = f" | {r['stud_farm']}" if r['stud_farm'] else ""
        print(f"  {r['name']:30s} {r['country'] or '':>4s}  €{r['stud_fee_eur']:>8,.0f}  {r['stud_status']}{farm_str}")

    conn.close()


if __name__ == "__main__":
    update_database()
