#![feature(c_variadic)]

use std::os::raw::c_int;
use std::ptr::{null_mut, NonNull};

use js_sys::{JsString, Uint8Array};
use libnspire::dir::EntryType;
use libnspire::{Error, Handle};
use rusb::GlobalContext;
use serde::Serialize;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

#[wasm_bindgen(start)]
pub fn set_panic_hook() {
    // When the `console_error_panic_hook` feature is enabled, we can call the
    // `set_panic_hook` function at least once during initialization, and then
    // we will get better error messages if our code ever panics.
    //
    // For more details see
    // https://github.com/rustwasm/console_error_panic_hook#readme
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

#[no_mangle]
pub unsafe extern "C" fn printf(format: *const u8, mut args: ...) -> c_int {
    0
}

#[no_mangle]
pub unsafe extern "C" fn puts(s: *const u8) -> c_int {
    0
}

#[no_mangle]
pub unsafe extern "C" fn gettimeofday(tp: *mut libusb1_sys::timeval, tz: *mut c_int) -> c_int {
    *tp = libusb1_sys::timeval {
        tv_sec: (js_sys::Date::now() / 1000.) as _,
        tv_usec: 0,
    };
    0
}

fn global() -> web_sys::DedicatedWorkerGlobalScope {
    js_sys::global().unchecked_into()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub is_dir: bool,
    pub date: u64,
    pub size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressUpdate {
    #[serde(flatten)]
    pub remaining: u32,
    pub total: u32,
}

fn progress_sender(total: u32) -> impl FnMut(usize) {
    let mut i = 0;
    move |remaining| {
        if i > 5 {
            i = 0;
        }
        if i == 0 || remaining == 0 {
            let update = ProgressUpdate {
                remaining: remaining as u32,
                total,
            };
            let value = serde_wasm_bindgen::to_value(&update).unwrap();
            global().post_message(&value);
        }
        i += 1;
    }
}

fn err<T, E: std::fmt::Display>(res: Result<T, E>) -> Result<T, JsValue> {
    match res {
        Ok(c) => Ok(c),
        Err(e) => Err(JsString::from(format!("{}", e).as_str()).into()),
    }
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "FileInfos")]
    pub type FileInfos;
    #[wasm_bindgen(typescript_type = "Info")]
    pub type CalcInfo;
}

#[wasm_bindgen]
pub struct Calculator {
    handle: libnspire::Handle<GlobalContext>,
}

#[wasm_bindgen]
impl Calculator {
    #[wasm_bindgen(constructor)]
    pub fn new(
        id: u32,
        vid: u16,
        pid: u16,
        comm: js_sys::Int32Array,
    ) -> Result<Calculator, JsValue> {
        let dev = libusb1_sys::init(id, (vid, pid), comm);
        let dev = unsafe {
            rusb::DeviceHandle::from_libusb(
                rusb::GlobalContext::default(),
                NonNull::new(dev).unwrap(),
            )
        };
        Ok(Calculator {
            handle: err(libnspire::Handle::new(dev))?,
        })
    }

    pub fn update(&self) -> Result<CalcInfo, JsValue> {
        Ok(serde_wasm_bindgen::to_value(&err(self.handle.info())?)
            .unwrap()
            .into())
    }

    pub fn list_dir(&self, path: &str) -> Result<FileInfos, JsValue> {
        let dir = err(self.handle.list_dir(path))?
            .iter()
            .map(|file| FileInfo {
                path: file.name().to_string_lossy().to_string(),
                is_dir: file.entry_type() == EntryType::Directory,
                date: file.date(),
                size: file.size(),
            })
            .collect::<Vec<_>>();
        Ok(serde_wasm_bindgen::to_value(&dir).unwrap().into())
    }

    pub fn download_file(&self, path: &str, size: u32) -> Result<Uint8Array, JsValue> {
        let mut buf = vec![0; size as usize];
        let size = err(self
            .handle
            .read_file(path, &mut buf, &mut progress_sender(size)))?;
        Ok((&buf[..size]).into())
    }

    pub fn upload_file(&self, path: &str, bytes: &[u8]) -> Result<(), JsValue> {
        err(self
            .handle
            .write_file(path, bytes, &mut progress_sender(bytes.len() as u32)))
    }

    pub fn upload_os(&self, bytes: &[u8]) -> Result<(), JsValue> {
        err(self
            .handle
            .send_os(bytes, &mut progress_sender(bytes.len() as u32)))
    }

    pub fn delete_file(&self, path: &str) -> Result<(), JsValue> {
        err(self.handle.delete_file(path))
    }

    pub fn delete_dir(&self, path: &str) -> Result<(), JsValue> {
        err(self.handle.delete_dir(path))
    }

    pub fn create_dir(&self, path: &str) -> Result<(), JsValue> {
        err(self.handle.create_dir(path))
    }

    pub fn copy_file(&self, src: &str, dest: &str) -> Result<(), JsValue> {
        err(self.handle.copy_file(src, dest))
    }

    pub fn move_file(&self, src: &str, dest: &str) -> Result<(), JsValue> {
        err(self.handle.move_file(src, dest))
    }
}
