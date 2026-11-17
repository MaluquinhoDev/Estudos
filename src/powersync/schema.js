import { Schema, Table, column } from "@powersync/web";

export const EstudosSchema = new Schema({
  profiles: new Table({
    display_name: column.text,
    created_at: column.text,
    updated_at: column.text
  }),
  courses: new Table({
    user_id: column.text,
    title: column.text,
    category: column.text,
    description: column.text,
    created_at: column.text,
    updated_at: column.text
  }),
  modules: new Table({
    user_id: column.text,
    course_id: column.text,
    title: column.text,
    position: column.integer,
    created_at: column.text,
    updated_at: column.text
  }),
  lessons: new Table({
    user_id: column.text,
    course_id: column.text,
    module_id: column.text,
    title: column.text,
    description: column.text,
    notes: column.text,
    status: column.text,
    created_at: column.text,
    updated_at: column.text
  }),
  review_cards: new Table({
    user_id: column.text,
    course_id: column.text,
    lesson_id: column.text,
    course_title: column.text,
    front: column.text,
    back: column.text,
    due: column.text,
    interval: column.integer,
    repetitions: column.integer,
    last_reviewed: column.text,
    created_at: column.text,
    updated_at: column.text
  }),
  resources: new Table({
    user_id: column.text,
    course_id: column.text,
    title: column.text,
    type: column.text,
    url: column.text,
    description: column.text,
    course_title: column.text,
    created_at: column.text,
    updated_at: column.text
  })
});
