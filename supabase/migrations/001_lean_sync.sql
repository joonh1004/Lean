begin;

-- The operator provisions exactly one row for an existing Auth user.
create table public.lean_sync_workspace (
  singleton boolean primary key default true check (singleton),
  owner_id uuid unique not null references auth.users(id) on delete cascade,
  revision integer not null default 0 check (revision >= 0),
  payload text check (pg_catalog.octet_length(payload) <= 8388608),
  previous_payload text check (pg_catalog.octet_length(previous_payload) <= 8388608),
  check ((revision = 0) = (payload is null))
);
alter table public.lean_sync_workspace enable row level security;
revoke all on public.lean_sync_workspace from public, anon, authenticated;
grant select on public.lean_sync_workspace to authenticated;
create policy lean_owner_read on public.lean_sync_workspace
  for select to authenticated using (owner_id = (select auth.uid()));

-- Check bounded wire structure before accepting or rotating any snapshot.
-- App-specific document semantics still require the browser's full decoder.
create function public.lean_sync_validate(snapshot text)
returns void
language plpgsql immutable set search_path = ''
as $$
declare
  doc jsonb;
  nested jsonb;
  problem jsonb;
  image jsonb;
  value text;
  field text;
  bytes bytea;
begin
  if snapshot is null or pg_catalog.octet_length(snapshot) > 8388608 then
    raise exception 'Invalid snapshot size' using errcode = '22023';
  end if;
  doc := snapshot::jsonb;
  if pg_catalog.jsonb_typeof(doc) is distinct from 'object'
    or doc->'version' is distinct from '1'::jsonb
    or coalesce(pg_catalog.jsonb_typeof(doc->'records'), '') not in ('string','null')
    or coalesce(pg_catalog.jsonb_typeof(doc->'quotes'), '') not in ('string','null')
    or pg_catalog.jsonb_typeof(doc->'problems') is distinct from 'array' then
    raise exception 'Invalid snapshot format' using errcode = '22023';
  end if;

  foreach field in array array['records','quotes'] loop
    if doc->>field is null then continue; end if;
    nested := (doc->>field)::jsonb;
    if pg_catalog.jsonb_typeof(nested) is distinct from 'object'
      or nested->'version' is distinct from '1'::jsonb then
      raise exception 'Invalid snapshot format' using errcode = '22023';
    end if;
    if field = 'records' then
      if pg_catalog.jsonb_typeof(nested->'records') is distinct from 'array'
        or (nested ? 'folders' and pg_catalog.jsonb_typeof(nested->'folders') is distinct from 'array') then
        raise exception 'Invalid snapshot format' using errcode = '22023';
      end if;
    elsif pg_catalog.jsonb_typeof(nested->'quotes') is distinct from 'array'
      or pg_catalog.jsonb_typeof(nested->'days') is distinct from 'object'
      or pg_catalog.jsonb_typeof(nested->'bag') is distinct from 'array'
      or coalesce(pg_catalog.jsonb_typeof(nested->'lastId'), '') not in ('string','null') then
      raise exception 'Invalid snapshot format' using errcode = '22023';
    end if;
  end loop;

  if exists (select 1 from pg_catalog.jsonb_array_elements(doc->'problems') as p(item)
      group by item->>'id' having count(*) > 1) then
    raise exception 'Invalid snapshot format' using errcode = '22023';
  end if;
  for problem in select item from pg_catalog.jsonb_array_elements(doc->'problems') as p(item) loop
    if pg_catalog.jsonb_typeof(problem) is distinct from 'object'
      or pg_catalog.jsonb_typeof(problem->'subject') is distinct from 'string' then
      raise exception 'Invalid snapshot format' using errcode = '22023';
    end if;
    foreach field in array array['id','title','savedAt'] loop
      if pg_catalog.jsonb_typeof(problem->field) is distinct from 'string' or (problem->>field) !~ '[^[:space:]]' then
        raise exception 'Invalid snapshot format' using errcode = '22023';
      end if;
    end loop;
    foreach field in array array['original','cleaned'] loop
      image := problem->field;
      if pg_catalog.jsonb_typeof(image) is distinct from 'object'
        or coalesce(image->>'type', '') not in ('image/png','image/jpeg','image/webp')
        or (field = 'cleaned' and image->>'type' <> 'image/png')
        or pg_catalog.jsonb_typeof(image->'data') is distinct from 'string'
        or (image ? 'name' and (pg_catalog.jsonb_typeof(image->'name') is distinct from 'string'
          or pg_catalog.jsonb_typeof(image->'lastModified') is distinct from 'number')) then
        raise exception 'Invalid snapshot format' using errcode = '22023';
      end if;
      if image ? 'name' and ((image->>'lastModified')::numeric <> pg_catalog.trunc((image->>'lastModified')::numeric)
        or pg_catalog.abs((image->>'lastModified')::numeric) > 9007199254740991) then
        raise exception 'Invalid snapshot format' using errcode = '22023';
      end if;
      value := image->>'data';
      if pg_catalog.length(value) not between 4 and 2796204 then
        raise exception 'Invalid snapshot image size' using errcode = '22023';
      end if;
      bytes := pg_catalog.decode(value, 'base64');
      if pg_catalog.octet_length(bytes) not between 1 and 2097152
        or pg_catalog.replace(pg_catalog.encode(bytes, 'base64'), E'\n', '') <> value then
        raise exception 'Invalid snapshot format' using errcode = '22023';
      end if;
    end loop;
  end loop;
end;
$$;
revoke all on function public.lean_sync_validate(text) from public, anon, authenticated;

-- The two public RPCs share the same authorization, row lock and validation;
-- repair explicitly keeps the previous payload instead of rotating it out.
create function public.lean_sync_store(expected_owner uuid, expected_revision integer, next_payload text, repair boolean)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  current_payload text;
  current_revision integer;
  next_revision integer;
begin
  if caller is null or caller is distinct from expected_owner then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if expected_revision is null or expected_revision < 0 or (repair and expected_revision = 0) then
    raise exception 'Invalid expected revision' using errcode = '22023';
  end if;
  select revision, payload into current_revision, current_payload
    from public.lean_sync_workspace where owner_id = caller for update;
  if not found then raise exception 'Access denied' using errcode = '42501'; end if;
  if current_revision <> expected_revision then return null; end if;

  perform public.lean_sync_validate(next_payload);
  if not repair and current_payload is not null then
    begin
      perform public.lean_sync_validate(current_payload);
    exception when data_exception then
      raise exception 'Current snapshot requires explicit repair' using errcode = '22023';
    end;
  end if;
  update public.lean_sync_workspace
     set previous_payload = case when repair then previous_payload else payload end,
         payload = next_payload, revision = revision + 1
   where owner_id = caller and revision = expected_revision
   returning revision into next_revision;
  return next_revision; -- null means stale; no write or backup rotation occurred
end;
$$;
revoke all on function public.lean_sync_store(uuid, integer, text, boolean) from public, anon, authenticated;

create function public.lean_sync_write(expected_owner uuid, expected_revision integer, next_payload text)
returns integer language sql security definer set search_path = ''
as $$ select public.lean_sync_store(expected_owner, expected_revision, next_payload, false) $$;
create function public.lean_sync_repair(expected_owner uuid, expected_revision integer, next_payload text)
returns integer language sql security definer set search_path = ''
as $$ select public.lean_sync_store(expected_owner, expected_revision, next_payload, true) $$;
revoke all on function public.lean_sync_write(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.lean_sync_repair(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.lean_sync_write(uuid, integer, text) to authenticated;
grant execute on function public.lean_sync_repair(uuid, integer, text) to authenticated;

commit;
