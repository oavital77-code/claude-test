import pytest

from src.options.tracking import compute_option_lots, pct_captured_now


def call_trade(id, trade_date, type, quantity, price, strike=100.0, expiry="2026-03-20", commission=0.0):
    return dict(id=id, trade_date=trade_date, type=type, quantity=quantity, price=price,
                commission=commission, currency="USD", strike=strike, expiry=expiry)


class TestOpenLots:
    def test_single_open_no_close(self):
        trades = [call_trade(1, "2026-02-01", "CALL_SELL_OPEN", 2, 2.5, commission=1.3)]
        result = compute_option_lots(trades)
        assert len(result.open_lots) == 1
        lot = result.open_lots[0]
        assert lot.contracts == 2
        # premium = 2*2.5*100 - 1.3 = 498.7
        assert lot.premium_received == pytest.approx(498.7)
        assert result.closed_tranches == []


class TestCallBuyClose:
    def test_full_close_computes_pct_captured(self):
        trades = [
            call_trade(1, "2026-02-01", "CALL_SELL_OPEN", 2, 2.5, commission=1.0),
            call_trade(2, "2026-03-01", "CALL_BUY_CLOSE", 2, 1.0, commission=1.0),
        ]
        result = compute_option_lots(trades)
        assert result.open_lots == []
        assert len(result.closed_tranches) == 1
        tranche = result.closed_tranches[0]
        # premium received = 2*2.5*100 - 1 = 499; cost to close = 2*1.0*100 + 1 = 201
        assert tranche.premium_received == pytest.approx(499.0)
        assert tranche.cost_to_close == pytest.approx(201.0)
        assert tranche.pct_captured == pytest.approx((499.0 - 201.0) / 499.0)

    def test_partial_close_leaves_remaining_open_lot(self):
        """Models a roll that changes contract count (section 13.4 edge case)."""
        trades = [
            call_trade(1, "2026-02-01", "CALL_SELL_OPEN", 3, 2.0, commission=0),
            call_trade(2, "2026-03-01", "CALL_BUY_CLOSE", 1, 1.0, commission=0),
        ]
        result = compute_option_lots(trades)
        assert len(result.open_lots) == 1
        assert result.open_lots[0].contracts == 2
        assert len(result.closed_tranches) == 1
        assert result.closed_tranches[0].contracts == 1


class TestExpiration:
    def test_expiration_is_100_pct_captured_with_no_cost(self):
        trades = [
            call_trade(1, "2026-02-01", "CALL_SELL_OPEN", 1, 3.0, commission=0),
            call_trade(2, "2026-03-20", "EXPIRATION", 1, 0.0, commission=0),
        ]
        result = compute_option_lots(trades)
        tranche = result.closed_tranches[0]
        assert tranche.cost_to_close == 0.0
        assert tranche.pct_captured == pytest.approx(1.0)


class TestAssignment:
    def test_assignment_quantity_is_shares_converted_to_contracts(self):
        """ASSIGNMENT.quantity is shares (matches STOCK_SELL); 200 shares = 2 contracts."""
        trades = [
            call_trade(1, "2026-02-01", "CALL_SELL_OPEN", 2, 3.0, commission=0),
            call_trade(2, "2026-03-20", "ASSIGNMENT", 200, 0.0, commission=0),
        ]
        result = compute_option_lots(trades)
        assert result.open_lots == []
        tranche = result.closed_tranches[0]
        assert tranche.contracts == 2
        assert tranche.cost_to_close == 0.0
        assert tranche.pct_captured == pytest.approx(1.0)


class TestFifoAcrossLots:
    def test_close_consumes_oldest_lot_first(self):
        trades = [
            call_trade(1, "2026-01-01", "CALL_SELL_OPEN", 1, 2.0, strike=100, commission=0),
            call_trade(2, "2026-01-15", "CALL_SELL_OPEN", 1, 3.0, strike=105, commission=0),
            call_trade(3, "2026-02-01", "CALL_BUY_CLOSE", 1, 1.0, commission=0),
        ]
        result = compute_option_lots(trades)
        assert len(result.open_lots) == 1
        assert result.open_lots[0].strike == 105
        assert result.closed_tranches[0].strike == 100

    def test_overselling_raises(self):
        trades = [
            call_trade(1, "2026-01-01", "CALL_SELL_OPEN", 1, 2.0, commission=0),
            call_trade(2, "2026-02-01", "CALL_BUY_CLOSE", 2, 1.0, commission=0),
        ]
        with pytest.raises(ValueError):
            compute_option_lots(trades)


class TestPctCapturedNow:
    def test_unrealized_pct_captured(self):
        trades = [call_trade(1, "2026-02-01", "CALL_SELL_OPEN", 2, 2.5, commission=0)]
        lot = compute_option_lots(trades).open_lots[0]
        # premium_received = 500; current value at $1.00/contract = 2*1.0*100 = 200
        pct = pct_captured_now(lot, current_option_price_per_contract=1.0)
        assert pct == pytest.approx((500.0 - 200.0) / 500.0)

    def test_none_when_no_premium(self):
        trades = [call_trade(1, "2026-02-01", "CALL_SELL_OPEN", 1, 0.0, commission=0)]
        lot = compute_option_lots(trades).open_lots[0]
        assert pct_captured_now(lot, 0.5) is None
