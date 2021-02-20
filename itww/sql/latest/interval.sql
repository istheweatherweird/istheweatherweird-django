with latest as (
  select timestamp as ref_interval_end,
    timestamp - '{interval}':: interval as ref_interval_start,
    extract(epoch from '{interval}'::interval) as interval_length
  from metar
  where place_id = {place_id}
  order by timestamp desc
  limit 1
),

raw0 as (
select temp, isd.timestamp
from isd
join latest on
isd.timestamp between ref_interval_start and ref_interval_end
where place_id = {place_id}

UNION ALL

select temp, metar.timestamp
from metar
join latest on
metar.timestamp between ref_interval_start and ref_interval_end
where place_id = {place_id}
),

raw as (
select temp, timestamp,
  lag(temp) OVER (order by timestamp) as temp_lag,
  extract(epoch from timestamp - lag(timestamp) OVER (order by timestamp)) as dt_length
from raw0
order by timestamp
)

select 
  max(ref_interval_end) as timestamp,
  -- avg(temp) as temp,
  -- use trapezoid rule for integration
  sum(dt_length / interval_length * (temp + temp_lag)/2) as temp,
  greatest(max(dt_length),
          extract(epoch from min(timestamp - ref_interval_start)),
          extract(epoch from min(ref_interval_end - timestamp))) /60/60 as max_gap_hours
from raw
join latest on TRUE