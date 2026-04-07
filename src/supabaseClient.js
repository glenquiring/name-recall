import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://thyzfnfzohwckfdoupvq.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoeXpmbmZ6b2h3Y2tmZG91cHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NDYxNDcsImV4cCI6MjA4ODIyMjE0N30.TOn5dFLtWtpemGuEnU51qW3P-iMTqbh_teQg4RPFCQ8";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
