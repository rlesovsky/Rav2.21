# =============================================================================
# models/schemas.py — Pydantic Response Models
# =============================================================================

from pydantic import BaseModel, Field
from typing import Optional


class StateMetrics(BaseModel):
    hours:     float
    kwh:       float
    cost_usd:  float
    pct_time:  float = 0.0
    color:     str


class ShiftMetrics(BaseModel):
    hours:     float
    kwh:       float
    cost_usd:  float
    by_state:  dict[str, StateMetrics]


class EnergySummary(BaseModel):
    period:         str
    rate_per_kwh:   float
    total_cost_usd: float
    total_kwh:      float
    by_state:       dict[str, StateMetrics]
    by_shift:       dict[str, ShiftMetrics]


class DailyStateMetrics(BaseModel):
    hours:     float
    kwh:       float
    cost_usd:  float
    color:     str


class DailyRecord(BaseModel):
    date:           str
    total_cost_usd: float
    total_kwh:      float
    by_state:       dict[str, DailyStateMetrics]
    by_shift:       dict[str, ShiftMetrics]


class TimelinePoint(BaseModel):
    timestamp:   str
    kw:          float
    kwh:         float
    cost_usd:    float
    state:       str
    color:       str
    tou_period:  str
    tou_rate:    float
    shift:       str


class CurrentMetrics(BaseModel):
    amps:          Optional[float]
    kw:            Optional[float]
    cost_per_hour: Optional[float]
    state:         str
    color:         str
    tou_period:    str
    tou_rate:      float
    shift:         str


class EnergyConfig(BaseModel):
    rate_per_kwh:  float = Field(..., ge=0.01, le=2.0)
    voltage:       float = Field(..., ge=100, le=600)
    power_factor:  float = Field(..., ge=0.5, le=1.0)


class RawDebugResponse(BaseModel):
    tag:         str
    point_count: int
    first:       Optional[dict]
    last:        Optional[dict]
