use super::*;

fn profiles() -> Value {
    serde_json::from_str::<Value>(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../tests/contracts/images-pricing.json"
    )))
    .unwrap()["profiles"]
        .clone()
}
fn wire() -> Value {
    let mut value = golden()["models_reply"]["data"]
        .as_array()
        .unwrap()
        .iter()
        .find(|model| model["model_category"] == "image")
        .unwrap()
        .clone();
    value["image_pricing"] = profiles();
    value["image_billing_mode"] = "image_count".into();
    value["sales_price"] = value["image_pricing"][0]["pricing"].clone();
    value
}
fn tariff(mode: &str, rate: &str) -> Value {
    let meters = if mode == "image_count" {
        vec!["image"]
    } else {
        crate::image_pricing::TOKEN_METERS.to_vec()
    };
    json!({"currency":"USD", "status":"configured", "meters":meters.iter().map(|meter| json!({"meter":meter,"unit_size":if mode == "image_count" {1} else {1_000_000},"unit_price":rate})).collect::<Vec<_>>()})
}

#[test]
fn image_pricing_projects_independent_modes_exact_account_rates_and_revisions() {
    for standard in ["image_count", "image_tokens_v1"] {
        for advanced in ["image_count", "image_tokens_v1"] {
            let mut value = wire();
            for (index, mode, price) in [
                (0, standard, "0.123456789012"),
                (1, advanced, "0.876543210987"),
            ] {
                value["image_pricing"][index]["image_billing_mode"] = mode.into();
                value["image_pricing"][index]["pricing"] = tariff(mode, price);
            }
            let model = map_model(&value, "catalog-revision").unwrap();
            let prices = model.image_pricing.as_ref().unwrap();
            assert_eq!(prices[0].image_billing_mode.as_deref(), Some(standard));
            assert_eq!(prices[1].image_billing_mode.as_deref(), Some(advanced));
            assert_eq!(
                prices[0].pricing.as_ref().unwrap().rates[0]
                    .unit_price
                    .as_deref(),
                Some("0.123456789012")
            );
            assert_eq!(
                prices[1].pricing.as_ref().unwrap().rates[0]
                    .unit_price
                    .as_deref(),
                Some("0.876543210987")
            );
            value["image_pricing"][1]["pricing"]["meters"][0]["unit_price"] =
                "0.000000000001".into();
            assert_ne!(
                model.revision,
                map_model(&value, "catalog-revision").unwrap().revision
            );
        }
    }
}

#[test]
fn image_pricing_distinguishes_advanced_only_zero_and_legacy_catalogs() {
    let mut value = wire();
    value["sales_price"] = json!({"currency":"USD","status":"unconfigured","meters":[]});
    value["image_pricing"][0] =
        json!({"scenario":"standard","configured":false,"image_billing_mode":null,"pricing":null});
    value["image_pricing"][1]["pricing"] = tariff("image_tokens_v1", "0.000000000000");
    let model = map_model(&value, "catalog").unwrap();
    assert_eq!(model.sales_price.as_ref().unwrap().status, "unconfigured");
    assert_eq!(
        crate::image_pricing::ensure_available(&model, false)
            .unwrap_err()
            .code,
        "pricing_unavailable"
    );
    crate::image_pricing::ensure_available(&model, true).unwrap();
    value.as_object_mut().unwrap().remove("image_pricing");
    let legacy = map_model(&value, "catalog").unwrap();
    assert!(legacy.image_pricing.is_none());
    let mut cached = serde_json::to_value(&model).unwrap();
    cached.as_object_mut().unwrap().remove("image_pricing");
    assert!(
        serde_json::from_value::<ModelView>(cached)
            .unwrap()
            .image_pricing
            .is_none()
    );
}

#[test]
fn image_pricing_rejects_malformed_tariffs_and_keeps_safe_remote_errors() {
    for kind in [
        "missing",
        "duplicate",
        "unit",
        "negative",
        "decimal",
        "mode",
        "scenario",
    ] {
        let mut value = wire();
        let advanced = &mut value["image_pricing"][1];
        match kind {
            "missing" => {
                advanced["pricing"]["meters"].as_array_mut().unwrap().pop();
            }
            "duplicate" => {
                advanced["pricing"]["meters"][1] = advanced["pricing"]["meters"][0].clone()
            }
            "unit" => advanced["pricing"]["meters"][0]["unit_size"] = json!(1000),
            "negative" => advanced["pricing"]["meters"][0]["unit_price"] = "-1".into(),
            "decimal" => advanced["pricing"]["meters"][0]["unit_price"] = "1..2".into(),
            "mode" => advanced["image_billing_mode"] = "future".into(),
            "scenario" => advanced["scenario"] = "standard".into(),
            _ => unreachable!(),
        }
        assert_eq!(
            map_model(&value, "catalog").unwrap_err().code,
            "invalid_panel_response",
            "{kind}"
        );
    }
    let error = images::generation_failure(
        503,
        br#"{"error":{"code":"pricing_unavailable","message":"PRIVATE_UPSTREAM_BODY"}}"#,
    );
    assert_eq!(error.code, "pricing_unavailable");
    assert!(!error.message.contains("PRIVATE"));
}

#[tokio::test]
async fn image_pricing_missing_selected_tariff_rejects_before_task_or_http() {
    for advanced in [false, true] {
        let (_dir, service, _vault, mut record, install) = setup();
        service
            .accept_credential(
                &mut record,
                &install,
                serde_json::from_value(golden()["credential_reply"]["data"].clone()).unwrap(),
            )
            .unwrap();
        let mut cache = service.account_cache(&record).unwrap();
        let model = cache
            .models
            .iter_mut()
            .find(|m| m.category == "image")
            .unwrap();
        let api: Value = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../tests/contracts/images-api-catalog.json"
        )))
        .unwrap();
        model.image_api_parameters =
            Some(serde_json::from_value(api["models"]["gpt-image-2.6-flare"].clone()).unwrap());
        let mut prices = map_image_pricing(&profiles()).unwrap().unwrap();
        let selected = &mut prices[usize::from(advanced)];
        selected.configured = false;
        selected.image_billing_mode = None;
        selected.pricing = None;
        model.image_pricing = Some(prices);
        let id = model.id.clone();
        service
            .store
            .put(
                "account-cache",
                &record.view.id,
                &record.view.account_id,
                &cache,
            )
            .unwrap();
        let calls = Arc::new(AtomicU64::new(0));
        let counted = calls.clone();
        service.http.scripted(Arc::new(move |_| {
            counted.fetch_add(1, Ordering::SeqCst);
            Box::pin(async { Err(fail("unexpected_fixture_http")) })
        }));
        let parameters = ImageParameters {
            quality: Some(if advanced { "high" } else { "auto" }.into()),
            ..Default::default()
        };
        assert_eq!(
            service
                .create_image_task(
                    &record.view.id,
                    record.view.revision,
                    &id,
                    "Synthetic pricing admission".into(),
                    parameters,
                    vec![]
                )
                .unwrap_err()
                .code,
            "pricing_unavailable"
        );
        assert!(
            service
                .store
                .list::<TaskView>("task", None)
                .unwrap()
                .is_empty()
        );
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}
