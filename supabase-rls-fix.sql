create policy "allow all reads" on releases for select using (true);
create policy "allow all inserts" on releases for insert with check (true);
create policy "allow all updates" on releases for update using (true);
create policy "allow all deletes" on releases for delete using (true);

create policy "allow all reads" on credits for select using (true);
create policy "allow all inserts" on credits for insert with check (true);

create policy "allow all reads" on tasks for select using (true);
create policy "allow all inserts" on tasks for insert with check (true);
create policy "allow all updates" on tasks for update using (true);

create policy "allow all reads" on submissions for select using (true);
create policy "allow all inserts" on submissions for insert with check (true);
create policy "allow all updates" on submissions for update using (true);
