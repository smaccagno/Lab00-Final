/**
 * Utility pura (zero SOQL/DML) per aggregare Voci di Incasso/Spesa secondo la
 * semantica canonica della Budget App.
 *
 * Regole:
 *  - filterDate != null + voceDate > filterDate  → voce scartata (non esisteva ancora)
 *  - Stato Prevista  → previsto += amount
 *  - Stato Effettiva → effettivo += amount
 *  - Stato Annullata + Stato_Precedente = Prevista  → previsto -= amount
 *  - Stato Annullata + Stato_Precedente = Effettiva → effettivo -= amount
 *  - Stato Annullata + Stato_Precedente blank (legacy) → voce scartata
 *  - Correzione finale: previsto<0 → 0; effettivo<0 → 0; totale = previsto + effettivo
 */
public with sharing class BudgetAggregator {

    public static final String STATO_PREVISTA = 'Prevista';
    public static final String STATO_EFFETTIVA = 'Effettiva';
    public static final String STATO_ANNULLATA = 'Annullata';

    public class AmountPair {
        public Decimal previsto = 0;
        public Decimal effettivo = 0;
        public Decimal totale = 0;
    }

    public static Boolean isInDateScope(Date voceDate, Date filterDate) {
        if (filterDate == null) return true;
        if (voceDate == null) return true;
        return voceDate <= filterDate;
    }

    /**
     * Accumula la voce sul pair in base a (stato, statoPrecedente).
     * Ritorna true se la voce ha contribuito, false se scartata.
     */
    public static Boolean accumulate(AmountPair pair, String stato, String statoPrecedente, Decimal amount) {
        if (pair == null) return false;
        Decimal a = amount == null ? 0 : amount;
        if (stato == STATO_EFFETTIVA) {
            pair.effettivo += a;
            return true;
        }
        if (stato == STATO_PREVISTA) {
            pair.previsto += a;
            return true;
        }
        if (stato == STATO_ANNULLATA) {
            if (statoPrecedente == STATO_PREVISTA) {
                pair.previsto -= a;
                return true;
            }
            if (statoPrecedente == STATO_EFFETTIVA) {
                pair.effettivo -= a;
                return true;
            }
            return false;
        }
        return false;
    }

    /** Azzera i negativi e calcola il totale. */
    public static void finalizePair(AmountPair pair) {
        if (pair == null) return;
        if (pair.previsto < 0) pair.previsto = 0;
        if (pair.effettivo < 0) pair.effettivo = 0;
        pair.totale = pair.previsto + pair.effettivo;
    }

    public static String normalizeCategoria(String raw) {
        return String.isBlank(raw) ? 'Non categorizzato' : raw;
    }
}
