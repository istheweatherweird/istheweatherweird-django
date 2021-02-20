select place_id, temp, timestamp
from metar
where place_id = {place_id}
order by timestamp desc
limit 1;