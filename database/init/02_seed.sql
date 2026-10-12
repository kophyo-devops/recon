-- Sample period + reconciliation seed (matches frontend mock preview)

INSERT INTO periods (label, year, month)
VALUES ('April 2026', 2026, 4)
ON CONFLICT (label) DO NOTHING;

WITH period AS (
    SELECT id FROM periods WHERE label = 'April 2026'
),
run AS (
    INSERT INTO reconciliation_runs (
        period_id,
        period_label,
        matched_count,
        mismatch_count,
        ird_paid,
        ceir_paid,
        adjusted_ird_sum,
        adjusted_ceir_sum,
        sums_equal
    )
    SELECT
        period.id,
        'April 2026',
        4711,
        2,
        4713,
        4711,
        1496856961,
        1496856961,
        TRUE
    FROM period
    RETURNING id
)
INSERT INTO mismatch_rows (
    run_id, application_id, category, amount_mmk, ird_status, ceir_status, detail
)
SELECT run.id, v.application_id, v.category, v.amount_mmk, v.ird_status, v.ceir_status, v.detail
FROM run
CROSS JOIN (
    VALUES
        (
            'MM-CR-FR83HPG',
            'unconfirmed',
            NULL::NUMERIC,
            'API status 99',
            'Not confirmed',
            'IRD Tax Payment HUB API returns exception: Source array was not long enough.'
        ),
        (
            'MM-CR-D4GA46L',
            'month_boundary',
            244283::NUMERIC,
            'Raw payment_dt in April',
            'Confirmed in May',
            'API returns txnDate 5/26/2026 — counted in May CEIR report, not April.'
        ),
        (
            'MM-CR-W7TEE3Y',
            'overpay',
            2500::NUMERIC,
            '890,060 MMK',
            '887,560 MMK',
            'HUB tax sum is higher than the payment confirmation sent to CEIR.'
        ),
        (
            'Multiple fraud IDs',
            'fraud',
            NULL::NUMERIC,
            '654 records',
            '693 records',
            'PayPlus deleted some fraud rows in HUB; all confirmations were still sent to CEIR.'
        ),
        (
            'Duplicate payment rows',
            'duplicate',
            NULL::NUMERIC,
            'Row-level count',
            'Unique Application ID',
            'One CEIR Application ID can appear as multiple Payment Hub transactions.'
        )
) AS v(application_id, category, amount_mmk, ird_status, ceir_status, detail);

WITH run AS (
    SELECT id FROM reconciliation_runs WHERE period_label = 'April 2026' ORDER BY created_at DESC LIMIT 1
)
INSERT INTO summary_metrics (run_id, label, ird_value, ceir_value, note, sort_order)
SELECT run.id, v.label, v.ird_value, v.ceir_value, v.note, v.sort_order
FROM run
CROSS JOIN (
    VALUES
        ('Records in reports', '5367', '5404', 'Some HUB rows share one CEIR Application ID', 1),
        ('Fraud applications', '654', '693', 'Fraud confirmations reach CEIR even when HUB deletes rows', 2),
        ('Successful / paid applications', '4713', '4711', 'Difference: MM-CR-FR83HPG, MM-CR-D4GA46L', 3),
        ('Tax in records (MMK)', '1,498,849,138.25', '1,503,465,610.25', NULL, 4),
        ('Adjusted paid sum (MMK)', '1,496,856,961', '1,496,856,961', 'After fraud, unconfirmed, and overpay adjustments', 5)
) AS v(label, ird_value, ceir_value, note, sort_order);
