with reference_dates0 as (
  select generate_series(
    '{timestamp}'::timestamp with time zone - '100 years'::interval,
    '{timestamp}'::timestamp with time zone,
    '1 year'::interval) as ref_date
),

reference_dates as (
  select ref_date,
    ref_date - '{interval}'::interval as ref_interval_start,
    ref_date as ref_interval_end,
    extract(epoch from '{interval}'::interval) as interval_length,
    extract(year from ref_date) as year
  from reference_dates0
),

raw as (
select year, temp, timestamp,
  lag(temp) OVER (partition by year order by timestamp) as temp_lag,
  extract(epoch from timestamp - lag(timestamp) OVER (partition by year order by timestamp)) as dt_length 
from reference_dates
join isd
on isd.timestamp between ref_interval_start and ref_interval_end
where place_id = {place_id}
)

select year, 
  -- avg(temp) as temp,
  -- use trapezoid rule for integration
  sum(dt_length / interval_length * (temp + temp_lag)/2) as temp,
  greatest(max(dt_length),
          extract(epoch from min(timestamp - ref_interval_start)),
          extract(epoch from min(ref_interval_end - timestamp))) /60/60 as max_gap_hours
from raw
join reference_dates using (year)
group by year
order by year