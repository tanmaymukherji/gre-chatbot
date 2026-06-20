do $$
begin
  if to_regclass('public.vikalp_sangam_stories') is not null then
    execute 'drop trigger if exists trg_surface_cache_vikalp_sangam_stories on public.vikalp_sangam_stories';
    execute 'create trigger trg_surface_cache_vikalp_sangam_stories after insert or update or delete on public.vikalp_sangam_stories for each statement execute function public.mark_surface_cache_dirty_supergre()';
  end if;
end;
$$;
