#!/usr/bin/env python3
"""Genera il PDF del Capitolo 4 — Valutazione economica e ROI."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle,
    PageBreak, KeepTogether
)
from reportlab.lib import colors
from pathlib import Path

DOC_DIR = Path(__file__).parent / "docs"
CHART_DIR = DOC_DIR / "roi_charts"
OUTPUT = Path(__file__).parent / "docs" / "Capitolo_4_ROI.pdf"

# Colori
PRIMARY = HexColor('#1a5276')
ACCENT = HexColor('#e74c3c')
LIGHT_GRAY = HexColor('#f5f5f5')
HEADER_BG = HexColor('#1a5276')

# Stili
styles = getSampleStyleSheet()

style_title = ParagraphStyle('CustomTitle', parent=styles['Title'],
    fontSize=22, textColor=PRIMARY, spaceAfter=6*mm, alignment=TA_CENTER,
    fontName='Helvetica-Bold')

style_h1 = ParagraphStyle('H1', parent=styles['Heading1'],
    fontSize=16, textColor=PRIMARY, spaceBefore=8*mm, spaceAfter=4*mm,
    fontName='Helvetica-Bold', borderWidth=0, borderPadding=0)

style_h2 = ParagraphStyle('H2', parent=styles['Heading2'],
    fontSize=13, textColor=PRIMARY, spaceBefore=5*mm, spaceAfter=3*mm,
    fontName='Helvetica-Bold')

style_body = ParagraphStyle('Body', parent=styles['Normal'],
    fontSize=10.5, leading=15, alignment=TA_JUSTIFY, spaceAfter=3*mm,
    fontName='Helvetica')

style_caption = ParagraphStyle('Caption', parent=styles['Normal'],
    fontSize=9, leading=12, textColor=HexColor('#555555'), alignment=TA_CENTER,
    spaceBefore=2*mm, spaceAfter=5*mm, fontName='Helvetica-Oblique')

style_table_header = ParagraphStyle('TableHeader', parent=styles['Normal'],
    fontSize=9, leading=11, textColor=white, fontName='Helvetica-Bold', alignment=TA_CENTER)

style_table_cell = ParagraphStyle('TableCell', parent=styles['Normal'],
    fontSize=9, leading=11, fontName='Helvetica', alignment=TA_LEFT)

style_table_cell_right = ParagraphStyle('TableCellR', parent=style_table_cell, alignment=TA_RIGHT)

style_source = ParagraphStyle('Source', parent=styles['Normal'],
    fontSize=8, leading=10, textColor=HexColor('#666666'), fontName='Helvetica-Oblique',
    spaceAfter=2*mm)


def img(path, width=16*cm):
    """Create a scaled image."""
    from PIL import Image as PILImage
    pil_img = PILImage.open(str(path))
    w, h = pil_img.size
    aspect = h / w
    return Image(str(path), width=width, height=width * aspect)


def make_table(data, col_widths=None, header_bg=HEADER_BG):
    """Create a styled table from list of lists."""
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), header_bg),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#cccccc')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, LIGHT_GRAY]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    return t


def P(text):
    return Paragraph(text, style_body)


def H1(text):
    return Paragraph(text, style_h1)


def H2(text):
    return Paragraph(text, style_h2)


def CAP(text):
    return Paragraph(text, style_caption)


# ─── Build PDF ───
doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4,
    leftMargin=2.2*cm, rightMargin=2.2*cm, topMargin=2*cm, bottomMargin=2*cm)

story = []

# Title
story.append(Paragraph("Capitolo 4", ParagraphStyle('ChNum', parent=styles['Normal'],
    fontSize=12, textColor=HexColor('#888888'), alignment=TA_CENTER, spaceAfter=2*mm)))
story.append(Paragraph("Valutazione economica e ROI delle decisioni di breeding", style_title))
story.append(Spacer(1, 8*mm))

# 4.1 Introduzione
story.append(H1("4.1 Introduzione"))
story.append(P(
    "L'industria del trotto italiano si basa su decisioni di allevamento ancora largamente empiriche: "
    "la scelta dello stallone, della fattrice e la strategia di accoppiamento dipendono da conoscenze "
    "tramandate, intuizione degli allevatori e valutazioni qualitative. Questo capitolo costruisce un "
    "modello economico quantitativo che risponde a una domanda concreta: <b>vale la pena pagare il "
    "tasso di monta di un determinato stallone?</b>"))
story.append(P(
    "Il modello integra dati reali da tre fonti: il database StatIppica (22.940 cavalli, 671.711 gare, "
    "guadagni di carriera per ciascun cavallo), i tassi di monta pubblici per la stagione 2026 (126 "
    "stalloni, da €500 a €35.000) e i costi di allevamento da listini di settore italiani. Il risultato "
    "è uno strumento di supporto decisionale che calcola il ritorno sull'investimento atteso (ROI) per "
    "ciascun accoppiamento, con intervalli di confidenza e analisi di sensitività."))

# 4.2 Costi
story.append(H1("4.2 Modello dei costi"))
story.append(P(
    "Il costo totale di un ciclo di allevamento — dalla monta alla prima gara — è composto da cinque "
    "fasi, ciascuna con voci di costo documentate da fonti pubbliche italiane."))

story.append(H2("4.2.1 Riproduzione e gestazione"))
story.append(make_table([
    [Paragraph("<b>Voce</b>", style_table_header), Paragraph("<b>Valore</b>", style_table_header), Paragraph("<b>Fonte</b>", style_table_header)],
    ["Inseminazione artificiale + diagnosi gravidanza", "€430", "CTS Moruzzo 2026, servizio 6"],
    ["Monitoraggio gravidanza", "€80", "CTS Moruzzo, servizi 9+11"],
    ["Assistenza al parto + analisi isoeritrolisi", "€400", "CTS Moruzzo, servizio 12"],
    ["Boarding fattrice in box (340 giorni)", "€5.100", "CTS Moruzzo, servizio 1"],
    [Paragraph("<b>Totale riproduzione</b>", style_table_cell), Paragraph("<b>€6.010</b>", style_table_cell_right), ""],
], col_widths=[8*cm, 3*cm, 5*cm]))
story.append(Spacer(1, 3*mm))

story.append(H2("4.2.2 Puledro (primo anno)"))
story.append(make_table([
    [Paragraph("<b>Voce</b>", style_table_header), Paragraph("<b>Valore</b>", style_table_header), Paragraph("<b>Fonte</b>", style_table_header)],
    ["Boarding fattrice+puledro al prato (180 giorni)", "€1.620", "CTS Moruzzo, servizio 4"],
    ["Registrazione nascita puledro", "€96", "UNIRE, tariffa 2026"],
    ["Veterinario (vaccinazioni, sverminazione)", "€500", "Media settore"],
    [Paragraph("<b>Totale primo anno</b>", style_table_cell), Paragraph("<b>€2.216</b>", style_table_cell_right), ""],
], col_widths=[8*cm, 3*cm, 5*cm]))
story.append(Spacer(1, 3*mm))

story.append(H2("4.2.3 Yearling (12 mesi in box)"))
story.append(make_table([
    [Paragraph("<b>Voce</b>", style_table_header), Paragraph("<b>Valore</b>", style_table_header), Paragraph("<b>Fonte</b>", style_table_header)],
    ["Boarding in box (365 giorni × €15/giorno)", "€5.475", "CTS Moruzzo, servizio 1"],
    ["Veterinario annuale", "€500", "Media settore"],
    ["Maniscalco annuale", "€600", "Club Cavallo Italia"],
    [Paragraph("<b>Totale yearling</b>", style_table_cell), Paragraph("<b>€6.575</b>", style_table_cell_right), ""],
], col_widths=[8*cm, 3*cm, 5*cm]))
story.append(Spacer(1, 3*mm))

story.append(H2("4.2.4 Training (18 mesi)"))
story.append(make_table([
    [Paragraph("<b>Voce</b>", style_table_header), Paragraph("<b>Valore</b>", style_table_header), Paragraph("<b>Fonte</b>", style_table_header)],
    ["Addestramento/doma (18 mesi × €350/mese)", "€6.300", "Listini scuderie italiane"],
    ["Boarding durante training (540 giorni)", "€8.100", "CTS Moruzzo, servizio 1"],
    ["Veterinario (1,5 anni)", "€750", "Media settore"],
    ["Maniscalco (1,5 anni)", "€900", "Media settore"],
    [Paragraph("<b>Totale training</b>", style_table_cell), Paragraph("<b>€16.050</b>", style_table_cell_right), ""],
], col_widths=[8*cm, 3*cm, 5*cm]))
story.append(Spacer(1, 3*mm))

story.append(H2("4.2.5 Attività agonistica (4 anni)"))
story.append(make_table([
    [Paragraph("<b>Voce</b>", style_table_header), Paragraph("<b>Valore</b>", style_table_header), Paragraph("<b>Fonte</b>", style_table_header)],
    ["Iscrizioni gare (4 anni × €500/anno)", "€2.000", "Media settore"],
    ["Assicurazione (4 anni × €600/anno)", "€2.400", "Media settore"],
    ["Attrezzatura (una tantum)", "€1.500", "Media settore"],
    [Paragraph("<b>Totale agonistico</b>", style_table_cell), Paragraph("<b>€5.900</b>", style_table_cell_right), ""],
], col_widths=[8*cm, 3*cm, 5*cm]))
story.append(Spacer(1, 3*mm))

story.append(H2("4.2.6 Costo fisso totale e rischio mortalità"))
story.append(P(
    "Il costo fisso totale (escluso stud fee) ammonta a <b>€35.214</b>. A questo si aggiunge il rischio "
    "di mortalità neonatale: con un tasso del 5% (Friesian Horse Italia), in caso di morte del puledro "
    "si perdono lo stud fee e i costi di riproduzione (€14.510 per Varenne). Il costo atteso, ponderato "
    "per il rischio, è: C_atteso = (1 - p_morte) × C_totale + p_morte × C_se_morte."))

story.append(img(CHART_DIR / "05_cost_breakdown.png"))
story.append(CAP("Figura 4.1 — Breakdown dei costi di allevamento per un accoppiamento con Varenne (stud fee €8.500). "
    "Costo totale atteso: €43.714. Fonti: CTS Moruzzo 2026, UNIRE 2026."))

# 4.3 Ricavi
story.append(PageBreak())
story.append(H1("4.3 Modello dei ricavi"))
story.append(H2("4.3.1 Guadagni medi per voto di performance"))
story.append(P(
    "Il database StatIppica contiene i guadagni di carriera reali per 16.585 cavalli con rating di "
    "performance. La distribuzione per voto mostra una forte asimmetria: i cavalli di grado SSS "
    "guadagnano in media €378.645, quelli di grado F appena €166."))

story.append(img(CHART_DIR / "01_grade_earnings.png"))
story.append(CAP("Figura 4.2 — Guadagno medio di carriera per voto di performance. Fonte: database StatIppica (16.585 cavalli)."))

story.append(make_table([
    [Paragraph("<b>Voto</b>", style_table_header), Paragraph("<b>N. cavalli</b>", style_table_header),
     Paragraph("<b>Guadagno medio</b>", style_table_header), Paragraph("<b>Minimo</b>", style_table_header),
     Paragraph("<b>Massimo</b>", style_table_header)],
    ["SSS", "195", "€378.645", "€50.558", "€3.437.556"],
    ["SS", "700", "€149.022", "€26.100", "€1.068.246"],
    ["S", "841", "€65.753", "€21.150", "€361.547"],
    ["A", "2.497", "€35.647", "€6.647", "€126.619"],
    ["B", "2.479", "€19.888", "€2.669", "€1.679.676"],
    ["C", "3.259", "€9.091", "€306", "€28.787"],
    ["D", "2.393", "€3.285", "€129", "€9.234"],
    ["E", "2.016", "€699", "€58", "€3.483"],
    ["F", "137", "€166", "€30", "€306"],
], col_widths=[2.5*cm, 3*cm, 4*cm, 3*cm, 4*cm]))
story.append(Spacer(1, 3*mm))

story.append(KeepTogether([
    Paragraph("4.3.2 Probabilità di ottenere ciascun voto", style_h2),
    P(
    "Per ciascuno stallone, la probabilità che un figlio ottenga un determinato voto è stimata dalla "
    "distribuzione empirica dei figli già nati e valutati nel database. Se lo stallone ha almeno 10 "
    "figli valutati, si usa la sua distribuzione specifica; altrimenti si ricorre alla distribuzione "
    "della popolazione generale.")
]))

# 4.4 ROI
story.append(PageBreak())
story.append(H1("4.4 Calcolo del ROI"))
story.append(P(
    "Il ROI è definito come: ROI = (R_atteso - C_atteso) / C_atteso, dove R_atteso è il ricavo atteso "
    "(somma di P(voto|stallone) × guadagno medio(voto)) e C_atteso è il costo atteso (costi fissi + "
    "stud fee, ponderati per il rischio di mortalità)."))

story.append(H2("4.4.1 ROI a livello di popolazione"))
story.append(P(
    "A livello di popolazione generale, il ricavo atteso è €24.825 e il costo atteso (senza stud fee) "
    "è €35.214. Il ROI è quindi <b>-29,5%</b> anche con stud fee zero, e peggiora con l'aumentare del "
    "costo della monta. Questo indica che l'allevamento di trotto in Italia è strutturalmente in "
    "perdita come valore atteso."))

story.append(img(CHART_DIR / "02_roi_by_studfee.png"))
story.append(CAP("Figura 4.3 — ROI atteso per livello di stud fee (modello popolazione). Fonte: database StatIppica + listini costi 2026."))

story.append(H2("4.4.2 ROI per stallone"))
story.append(P(
    "Su 100 stalloni con stud fee disponibile, solo <b>5 hanno ROI positivo</b>:"))

story.append(make_table([
    [Paragraph("<b>Stallone</b>", style_table_header), Paragraph("<b>Voto</b>", style_table_header),
     Paragraph("<b>Stud Fee</b>", style_table_header), Paragraph("<b>ROI</b>", style_table_header),
     Paragraph("<b>P(recupero)</b>", style_table_header)],
    ["Raja Mirchi", "SS", "€4.500", "+48,3%", "33,3%"],
    ["Village Mystic", "S", "€3.000", "+20,1%", "16,7%"],
    ["Readly Express", "SS", "€11.500", "+9,1%", "15,7%"],
    ["Royal Dream", "S", "€3.000", "+6,9%", "15,4%"],
    ["Donato Hanover", "S", "€5.000", "+6,0%", "18,7%"],
], col_widths=[4*cm, 2*cm, 3*cm, 3*cm, 3*cm]))
story.append(Spacer(1, 3*mm))

story.append(P(
    "I 95 stalloni restanti hanno ROI negativo. I casi più notevoli: Face Time Bourbon (€35.000, ROI "
    "-1,4%) è essenzialmente in pareggio; Varenne (€8.500, ROI -16,2%) non recupera il costo della "
    "monta dai guadagni medi dei figli."))

story.append(img(CHART_DIR / "03_top15_roi.png", width=17*cm))
story.append(CAP("Figura 4.4 — Top 15 stalloni per ROI atteso. Solo 5 su 100 hanno ROI positivo. "
    "Fonte: database StatIppica + Trot Stallions Directory 2026."))

story.append(PageBreak())
story.append(H2("4.4.3 Stud fee vs ROI"))
story.append(P(
    "Lo scatter plot mostra che non c'è correlazione tra costo della monta e redditività: stalloni "
    "costosi non garantiscono ROI positivi, e i migliori investimenti sono spesso a prezzi contenuti."))

story.append(img(CHART_DIR / "07_fee_vs_roi_scatter.png", width=17*cm))
story.append(CAP("Figura 4.5 — Stud fee vs ROI atteso per 100 stalloni. Il colore indica il voto di performance. "
    "Fonte: database StatIppica + ANACT 2025 + Trot Stallions Directory 2026."))

# 4.5 Sensitivity
story.append(H1("4.5 Analisi di sensitività"))
story.append(P(
    "L'analisi valuta come cambia il ROI se la probabilità di ottenere figli top-grade (SSS, SS, S) "
    "varia del ±10%, ±20%, ±30% rispetto al baseline."))

story.append(img(CHART_DIR / "06_sensitivity_varenne.png"))
story.append(CAP("Figura 4.6 — Analisi di sensitività per Varenne (€8.500). Anche con +30% di probabilità "
    "di figli top-grade, il ROI resta leggermente negativo (-1,0%)."))

story.append(P(
    "Per Varenne, il ROI passa da -16,2% (base) a -1,0% con un +30% di probabilità di figli top-grade. "
    "Il break-even richiederebbe un incremento del 35-40% — scenario improbabile senza cambiamenti "
    "nelle pratiche di selezione."))

# 4.6 Monte Carlo
story.append(PageBreak())
story.append(H1("4.6 Simulazione Monte Carlo"))
story.append(P(
    "L'analisi del valore atteso nasconde un aspetto cruciale: la distribuzione dei risultati è "
    "fortemente asimmetrica. La maggior parte dei cavalli perde denaro, ma una piccola percentuale "
    "genera guadagni eccezionali. La simulazione Monte Carlo (10.000 iterazioni) per un accoppiamento "
    "con Varenne produce questa distribuzione:"))

story.append(img(CHART_DIR / "04_montecarlo_varenne.png"))
story.append(CAP("Figura 4.7 — Distribuzione dei risultati economici per 10.000 cicli di allevamento simulati "
    "con Varenne (stud fee €8.500). Mediana: -€27.376, P(utile>0) = 19,8%."))

story.append(make_table([
    [Paragraph("<b>Statistica</b>", style_table_header), Paragraph("<b>Valore</b>", style_table_header)],
    ["Mediana dell'utile", "-€27.376"],
    ["P(utile > 0)", "19,8%"],
    ["Perdita massima", "-€43.714"],
    ["Guadagno massimo", "+€3.393.842"],
], col_widths=[8*cm, 4*cm]))
story.append(Spacer(1, 3*mm))

story.append(KeepTogether([
    Paragraph("4.6.1 Bootstrap: intervalli di confidenza", style_h2),
    P("Per i top 10 stalloni, il ROI è stato calcolato con bootstrap (1.000 ricampionamenti dei "
      "guadagni per grado):"),
    make_table([
    [Paragraph("<b>Stallone</b>", style_table_header), Paragraph("<b>ROI</b>", style_table_header),
     Paragraph("<b>IC 95% bootstrap</b>", style_table_header), Paragraph("<b>P(ROI>0)</b>", style_table_header)],
    ["Raja Mirchi", "+48,3%", "[+41,7%, +55,2%]", "100,0%"],
    ["Village Mystic", "+20,1%", "[+14,1%, +27,5%]", "100,0%"],
    ["Readly Express", "+9,1%", "[+0,4%, +18,5%]", "97,9%"],
    ["Royal Dream", "+6,9%", "[+1,0%, +12,9%]", "99,5%"],
    ["Donato Hanover", "+6,0%", "[+1,3%, +11,8%]", "99,5%"],
    ["Face Time Bourbon", "-1,4%", "[-9,5%, +6,7%]", "35,0%"],
    ["Father Patrick", "-13,3%", "[-19,3%, -6,3%]", "0,0%"],
    ["Maharajah", "-13,7%", "[-17,4%, -9,6%]", "0,0%"],
    ["Varenne", "-16,2%", "[-19,2%, -13,0%]", "0,0%"],
    ["Bold Eagle", "-20,4%", "[-23,8%, -16,6%]", "0,0%"],
], col_widths=[4*cm, 2.5*cm, 5*cm, 2.5*cm]),
]))

# 4.7 Break-even
story.append(PageBreak())
story.append(H1("4.7 Analisi di break-even"))
story.append(P("Per ciascuno stallone è stato calcolato lo stud fee massimo che renderebbe il ROI nullo:"))

story.append(make_table([
    [Paragraph("<b>Stallone</b>", style_table_header), Paragraph("<b>Stud fee attuale</b>", style_table_header),
     Paragraph("<b>Break-even fee</b>", style_table_header), Paragraph("<b>Margine</b>", style_table_header)],
    ["Raja Mirchi", "€4.500", "€23.673", "+€19.173"],
    ["Village Mystic", "€3.000", "€10.696", "+€7.696"],
    ["Readly Express", "€11.500", "€15.750", "+€4.250"],
    ["Royal Dream", "€3.000", "€5.633", "+€2.633"],
    ["Donato Hanover", "€5.000", "€7.420", "+€2.420"],
    ["Face Time Bourbon", "€35.000", "€34.009", "-€991"],
    ["Varenne", "€8.500", "€1.413", "-€7.087"],
], col_widths=[4*cm, 4*cm, 4*cm, 4*cm]))
story.append(Spacer(1, 3*mm))

story.append(P(
    "Solo 5 stalloni hanno uno stud fee inferiore al break-even. Per Varenne, il break-even è €1.413 "
    "contro un costo attuale di €8.500: il prezzo della monta è 6 volte superiore al valore che i dati "
    "attribuiscono alla progenie."))

# 4.8 Discussion
story.append(H1("4.8 Discussione"))
story.append(H2("4.8.1 L'allevamento come lotteria"))
story.append(P(
    "I risultati mostrano che l'allevamento di trotto è economicamente paragonabile a una lotteria: "
    "il valore atteso è negativo per il 95% degli stalloni, ma circa 1 figlio su 5 (19,8% per Varenne) "
    "genera un ritorno positivo. La redditività dipende non dalla frequenza delle vincite, ma "
    "dall'entità delle vincite rare — i cavalli di grado SSS che guadagnano €378.645 in media."))
story.append(P(
    "Implicazioni pratiche: (1) un allevatore dovrebbe diversificare su multiple monte per "
    "distribuire il rischio; (2) lo stud fee non è un indicatore di redditività — Raja Mirchi "
    "(€4.500) ha un ROI 50 volte superiore a Face Time Bourbon (€35.000); (3) con costi fissi di "
    "€35.214, solo stalloni con progenie sistematicamente sopra la media generano ROI positivo."))

story.append(H2("4.8.2 Limiti del modello"))
story.append(P(
    "<b>1. Guadagni di carriera incompleti:</b> i guadagni riflettono le corse fino alla data di "
    "raccolta. I cavalli giovani non hanno completato la carriera, quindi i guadagni medi per grado "
    "sono sottostimati per le coorti recenti.<br/>"
    "<b>2. Valore di riproduzione non incluso:</b> un figlio che diventa stallone o fattrice genera "
    "ricavi aggiuntivi. Il modello considera solo i guadagni di corsa, sottostimando il ROI per le "
    "progenie di qualità superiore.<br/>"
    "<b>3. Costi medi, non specifici:</b> i costi variano tra regioni e strutture. I valori usati "
    "sono medie nazionali.<br/>"
    "<b>4. Modello probabilistico per stallone:</b> per stalloni con pochi figli valutati, si ricorre "
    "alla distribuzione di popolazione, che può non riflettere la qualità genetica specifica.<br/>"
    "<b>5. Assenza della componente materna:</b> il modello non distingue l'apporto della fattrice."))

story.append(H2("4.8.3 Estensioni future"))
story.append(P(
    "Modello gerarchico bayesiano per stalloni con pochi figli; integrazione del valore riproduttivo "
    "dei figli stalloni; dati ANACT/UNIRE per modellare l'interazione genetica stallone × fattrice."))

# 4.9 Conclusioni
story.append(H1("4.9 Conclusioni"))
story.append(P(
    "<b>1.</b> L'allevamento di trotto in Italia è strutturalmente in perdita come valore atteso "
    "(-29,5% a livello di popolazione), e la redditività dipende interamente dalla selezione dello "
    "stallone."))
story.append(P(
    "<b>2.</b> Solo 5 stalloni su 100 generano ROI positivo, e nessuno di questi ha uno stud fee "
    "superiore a €11.500. Il costo della monta non è correlato alla redditività."))
story.append(P(
    "<b>3.</b> La distribuzione dei risultati è fortemente asimmetrica: la mediana è negativa anche "
    "per i migliori stalloni, ma circa 1 figlio su 5 produce un ritorno positivo. L'allevamento è "
    "un'attività ad alto rischio che richiede diversificazione."))

# Fonti
story.append(Spacer(1, 8*mm))
story.append(H2("Fonti dati"))
sources = [
    ["Database StatIppica", "Guadagni carriera 16.585 cavalli", "Dati interni"],
    ["Trot Stallions Directory", "126 tassi di monta 2026", "trotstallionsdirectory.com"],
    ["ANACT Speciale Stalloni", "Tassi di monta stalloni ITA", "anact.it"],
    ["CTS Moruzzo", "Listino servizi riproduzione", "ctsmoruzzo.it"],
    ["UNIRE", "Tariffe iscrizione puledri", "unire.gov.it"],
    ["ISMEA", "Prezzi medi nazionali equini", "ismea.it"],
    ["Gioconews", "Montepremi trotto 2024", "gioconews.it"],
    ["Friesian Horse Italia", "Tasso mortalità neonatale", "fivmagazine.it"],
]
story.append(make_table([
    [Paragraph("<b>Fonte</b>", style_table_header), Paragraph("<b>Dato</b>", style_table_header),
     Paragraph("<b>URL</b>", style_table_header)],
] + [[s[0], s[1], s[2]] for s in sources], col_widths=[5*cm, 6*cm, 5*cm]))

# Build
doc.build(story)
print(f"PDF generato: {OUTPUT}")
