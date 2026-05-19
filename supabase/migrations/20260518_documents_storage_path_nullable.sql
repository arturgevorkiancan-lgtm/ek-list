-- Allow metadata-only document rows when Storage upload fails (e.g. Firefox CORS on localhost)
alter table documents alter column storage_path drop not null;
