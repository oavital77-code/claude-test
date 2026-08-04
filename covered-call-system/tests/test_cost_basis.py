import pytest

from src.journal.cost_basis import (
    adjusted_cost_basis,
    compute_fifo,
    net_premium_collected,
)


def stock_trade(id, trade_date, type, quantity, price, commission=0.0, currency="USD"):
    return dict(id=id, trade_date=trade_date, type=type, quantity=quantity,
                price=price, commission=commission, currency=currency)


def option_trade(id, trade_date, type, quantity, price, commission=0.0, currency="USD"):
    return stock_trade(id, trade_date, type, quantity, price, commission, currency)


class TestFifoBasics:
    def test_single_buy_no_sell(self):
        trades = [stock_trade(1, "2026-01-01", "STOCK_BUY", 100, 50.0, commission=1.0)]
        result = compute_fifo(trades)
        assert result.shares_held == 100
        assert result.realized_sales == []
        assert result.avg_cost_raw == pytest.approx(50.0 + 1.0 / 100)

    def test_full_sell_realizes_gain(self):
        trades = [
            stock_trade(1, "2026-01-01", "STOCK_BUY", 100, 50.0, commission=1.0),
            stock_trade(2, "2026-02-01", "STOCK_SELL", 100, 60.0, commission=1.0),
        ]
        result = compute_fifo(trades)
        assert result.shares_held == 0
        assert len(result.realized_sales) == 1
        sale = result.realized_sales[0]
        assert sale.quantity == 100
        # proceeds 100*60 - 1 = 5999; cost 100*50 + 1 = 5001; gain = 998
        assert sale.gain == pytest.approx(998.0)

    def test_partial_sell_leaves_remaining_lot(self):
        trades = [
            stock_trade(1, "2026-01-01", "STOCK_BUY", 100, 50.0),
            stock_trade(2, "2026-02-01", "STOCK_SELL", 40, 60.0),
        ]
        result = compute_fifo(trades)
        assert result.shares_held == 60
        assert result.realized_sales[0].quantity == 40
        assert result.avg_cost_raw == pytest.approx(50.0)

    def test_fifo_order_across_multiple_lots(self):
        """Sell should consume the OLDEST lot first, at the oldest lot's cost."""
        trades = [
            stock_trade(1, "2026-01-01", "STOCK_BUY", 50, 40.0),   # older, cheaper
            stock_trade(2, "2026-01-15", "STOCK_BUY", 50, 60.0),   # newer, pricier
            stock_trade(3, "2026-02-01", "STOCK_SELL", 60, 100.0),  # eats all of lot1 + 10 of lot2
        ]
        result = compute_fifo(trades)
        assert result.shares_held == 40
        assert result.avg_cost_raw == pytest.approx(60.0)  # only lot2 remainder left
        assert len(result.realized_sales) == 2
        assert result.realized_sales[0].quantity == 50
        assert result.realized_sales[0].buy_price == 40.0
        assert result.realized_sales[1].quantity == 10
        assert result.realized_sales[1].buy_price == 60.0

    def test_assignment_closes_lot_like_a_sale(self):
        trades = [
            stock_trade(1, "2026-01-01", "STOCK_BUY", 100, 50.0),
            stock_trade(2, "2026-02-01", "ASSIGNMENT", 100, 55.0),
        ]
        result = compute_fifo(trades)
        assert result.shares_held == 0
        assert result.realized_sales[0].gain == pytest.approx((55.0 - 50.0) * 100)

    def test_selling_more_than_held_raises(self):
        trades = [
            stock_trade(1, "2026-01-01", "STOCK_BUY", 50, 50.0),
            stock_trade(2, "2026-02-01", "STOCK_SELL", 100, 60.0),
        ]
        with pytest.raises(ValueError):
            compute_fifo(trades)

    def test_trades_processed_in_date_order_regardless_of_input_order(self):
        trades = [
            stock_trade(2, "2026-02-01", "STOCK_SELL", 100, 60.0),
            stock_trade(1, "2026-01-01", "STOCK_BUY", 100, 50.0),
        ]
        result = compute_fifo(trades)
        assert result.shares_held == 0
        assert len(result.realized_sales) == 1


class TestPremiumAndAdjustedCostBasis:
    def test_net_premium_combines_open_and_close(self):
        trades = [
            option_trade(1, "2026-01-01", "CALL_SELL_OPEN", 2, 2.5, commission=1.0),  # +500 -1
            option_trade(2, "2026-02-01", "CALL_BUY_CLOSE", 2, 1.0, commission=1.0),  # -200 -1
        ]
        # received 499, paid 201 -> net 298
        assert net_premium_collected(trades) == pytest.approx(298.0)

    def test_net_premium_ignores_dividends_and_stock_trades(self):
        trades = [
            stock_trade(1, "2026-01-01", "STOCK_BUY", 100, 50.0),
            stock_trade(2, "2026-01-05", "DIVIDEND", 100, 0.5),
        ]
        assert net_premium_collected(trades) == 0.0

    def test_adjusted_cost_basis_reduces_raw_cost_by_premium_per_share(self):
        trades = [stock_trade(1, "2026-01-01", "STOCK_BUY", 100, 50.0)]
        fifo = compute_fifo(trades)
        adjusted = adjusted_cost_basis(fifo, total_premium=500.0)
        assert adjusted == pytest.approx(50.0 - 5.0)

    def test_adjusted_cost_basis_none_when_no_shares_held(self):
        trades = [
            stock_trade(1, "2026-01-01", "STOCK_BUY", 100, 50.0),
            stock_trade(2, "2026-02-01", "STOCK_SELL", 100, 60.0),
        ]
        fifo = compute_fifo(trades)
        assert adjusted_cost_basis(fifo, total_premium=500.0) is None
