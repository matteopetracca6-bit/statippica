import sqlite3
c = sqlite3.connect("data.db")
r = c.execute("""SELECT birth_year, COUNT(*), SUM(coat_color IS NOT NULL AND coat_color <> '' AND coat_color <> 'n/d') FROM horses
                 WHERE birth_year BETWEEN 1990 AND 2026 GROUP BY 1 ORDER BY 1""").fetchall()
print("ANNATE", r)
t = c.execute("SELECT COUNT(*), SUM(coat_color IS NOT NULL AND coat_color <> '' AND coat_color <> 'n/d') FROM horses").fetchone(); print("TOTALE", t)
t2 = c.execute("SELECT COUNT(*), SUM(coat_color IS NOT NULL AND coat_color <> '' AND coat_color <> 'n/d') FROM horses WHERE career_races > 0").fetchone(); print("CON_CORSE", t2)
print("ESITI", c.execute("SELECT esito, COUNT(*) FROM manti_unire_letti GROUP BY 1").fetchall())
print("ESEMPI", c.execute("SELECT name, birth_year, coat_color FROM horses WHERE source='unire_blocco' AND coat_color IS NOT NULL AND career_races > 20 ORDER BY career_earnings DESC LIMIT 3").fetchall())
